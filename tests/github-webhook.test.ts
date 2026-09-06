import { createHmac } from "node:crypto";
import type { AddressInfo, Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  verifyGitHubWebhookSignature,
} from "../packages/github-app/src";
import type {
  GitHubAppStore,
  GitHubRepositoryMetadata,
  InstallationCreatedInput,
  SetupPullRequestClosedInput,
} from "../apps/api/src/github-app-store";
import { createLedgerServer } from "../apps/api/src/server";

const WEBHOOK_SECRET = "github-webhook-secret-0123456789abcdef";
const INSTALLATION_ID = 201;
const INSTALLER_GITHUB_USER_ID = 101;
const FIRST_REPOSITORY_ID = 301;
const SECOND_REPOSITORY_ID = 302;

function sign(rawBody: Buffer | Uint8Array, secret = WEBHOOK_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function repository(
  repositoryId: number,
  fullName = `limen-owner/repository-${repositoryId}`,
): GitHubRepositoryMetadata {
  const [ownerLogin, repositoryName] = fullName.split("/");
  return {
    repositoryId,
    ownerLogin: ownerLogin ?? "limen-owner",
    repositoryName: repositoryName ?? `repository-${repositoryId}`,
    fullName,
    defaultBranch: "main",
  };
}

function githubRepositoryPayload(metadata: GitHubRepositoryMetadata) {
  return {
    id: metadata.repositoryId,
    name: metadata.repositoryName,
    full_name: metadata.fullName,
    default_branch: metadata.defaultBranch,
    owner: { login: metadata.ownerLogin },
  };
}

function installationCreatedPayload(
  repositories = [repository(FIRST_REPOSITORY_ID)],
) {
  return {
    action: "created",
    installation: {
      id: INSTALLATION_ID,
      account: {
        id: 501,
        login: "limen-owner",
        type: "Organization",
      },
      repositories: repositories.map(githubRepositoryPayload),
    },
    sender: {
      id: INSTALLER_GITHUB_USER_ID,
      login: "installer",
    },
  };
}

class FakeGitHubAppStore implements GitHubAppStore {
  readonly deliveries = new Set<string>();
  readonly installations = new Map<number, {
    installationId: number;
    accountId: number;
    accountLogin: string;
    accountType: "User" | "Organization";
    installedByGithubUserId: number;
    boundByAuthUserId: string | null;
    connectionState: "ACTIVE" | "DISCONNECTED";
  }>();
  readonly repositories = new Map<number, GitHubRepositoryMetadata & {
    installationId: number;
    lifecycleState:
      | "SETUP_REQUIRED"
      | "SETUP_PR_OPEN"
      | "CONFIGURED"
      | "VERIFIED"
      | "NEEDS_ATTENTION"
      | "DISCONNECTED";
  }>();
  readonly setupPullRequests = new Map<string, { state: "OPEN" | "MERGED" | "CLOSED" }>();
  readonly historicalEvaluationIds = new Set<number>();
  mutationCount = 0;

  async claimDelivery(deliveryId: string): Promise<{ duplicate: boolean }> {
    if (this.deliveries.has(deliveryId)) {
      return { duplicate: true };
    }
    this.deliveries.add(deliveryId);
    return { duplicate: false };
  }

  async recordInstallationCreated(input: InstallationCreatedInput): Promise<void> {
    this.mutationCount += 1;
    this.installations.set(input.installationId, {
      ...input,
      boundByAuthUserId: null,
      connectionState: "ACTIVE",
    });
    for (const metadata of input.repositories) {
      this.repositories.set(metadata.repositoryId, {
        ...metadata,
        installationId: input.installationId,
        lifecycleState: "SETUP_REQUIRED",
      });
    }
  }

  async disconnectInstallation(installationId: number): Promise<void> {
    this.mutationCount += 1;
    const installation = this.installations.get(installationId);
    if (installation) {
      installation.connectionState = "DISCONNECTED";
    }
    for (const repositoryRecord of this.repositories.values()) {
      if (repositoryRecord.installationId === installationId) {
        repositoryRecord.lifecycleState = "DISCONNECTED";
      }
    }
  }

  async addInstallationRepositories(
    installationId: number,
    repositories: readonly GitHubRepositoryMetadata[],
  ): Promise<void> {
    this.mutationCount += 1;
    for (const metadata of repositories) {
      this.repositories.set(metadata.repositoryId, {
        ...metadata,
        installationId,
        lifecycleState: "SETUP_REQUIRED",
      });
    }
  }

  async removeInstallationRepositories(
    installationId: number,
    repositoryIds: readonly number[],
  ): Promise<void> {
    this.mutationCount += 1;
    for (const repositoryId of repositoryIds) {
      const repositoryRecord = this.repositories.get(repositoryId);
      if (repositoryRecord?.installationId === installationId) {
        repositoryRecord.lifecycleState = "DISCONNECTED";
      }
    }
  }

  async syncSetupPullRequestClosed(input: SetupPullRequestClosedInput): Promise<void> {
    this.mutationCount += 1;
    const key = `${input.repositoryId}:${input.pullRequestNumber}`;
    const setupPullRequest = this.setupPullRequests.get(key);
    if (!setupPullRequest || setupPullRequest.state !== "OPEN") {
      return;
    }
    setupPullRequest.state = input.merged ? "MERGED" : "CLOSED";
    const repositoryRecord = this.repositories.get(input.repositoryId);
    if (repositoryRecord) {
      repositoryRecord.lifecycleState = input.merged ? "CONFIGURED" : "SETUP_REQUIRED";
    }
  }
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startServer(
  store: GitHubAppStore,
  maxBodyBytes?: number,
): Promise<{ server: Server; url: string }> {
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-WEBHOOK-TEST", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ingest-secret",
    githubWebhook: {
      secret: WEBHOOK_SECRET,
      store,
      ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    },
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function postWebhook(
  url: string,
  rawBody: Buffer | Uint8Array,
  headers: Record<string, string | undefined> = {},
): Promise<Response> {
  const defaultHeaders: Record<string, string> = {
    "content-type": "application/json",
    "X-Hub-Signature-256": sign(rawBody),
    "X-GitHub-Delivery": "delivery-1",
    "X-GitHub-Event": "installation",
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      delete defaultHeaders[key];
    } else {
      defaultHeaders[key] = value;
    }
  }
  return fetch(`${url}/v1/github/webhooks`, {
    method: "POST",
    headers: defaultHeaders,
    body: Buffer.from(rawBody).toString("utf8"),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("GitHub webhook signature verification", () => {
  it("accepts a valid signature over the exact raw bytes", () => {
    const rawBody = Buffer.from('{"b":2, "a":1}', "utf8");
    expect(verifyGitHubWebhookSignature(rawBody, sign(rawBody), WEBHOOK_SECRET)).toBe(true);
  });

  it("rejects a one-byte body modification", () => {
    const rawBody = Buffer.from('{"action":"created"}', "utf8");
    const modifiedBody = Buffer.from('{"action":"created"}', "utf8");
    modifiedBody[modifiedBody.length - 2] = "e".charCodeAt(0);
    expect(verifyGitHubWebhookSignature(modifiedBody, sign(rawBody), WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects a parsed and re-serialized body with different bytes", () => {
    const rawBody = Buffer.from('{"b":2, "a":1}', "utf8");
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString("utf8"))), "utf8");
    expect(reserialized.equals(rawBody)).toBe(false);
    expect(verifyGitHubWebhookSignature(reserialized, sign(rawBody), WEBHOOK_SECRET)).toBe(false);
  });

  it.each([
    ["malformed", "sha256=not-hex"],
    ["missing", undefined],
    ["wrong secret", sign(Buffer.from("body"), "different-secret")],
  ])("rejects a %s signature", (_label, signature) => {
    expect(verifyGitHubWebhookSignature(
      Buffer.from("body"),
      signature,
      WEBHOOK_SECRET,
    )).toBe(false);
  });

  it("requires the sha256 signature prefix and a 64-character hexadecimal digest", () => {
    const rawBody = Buffer.from("body");
    expect(verifyGitHubWebhookSignature(
      rawBody,
      `sha1=${createHmac("sha1", WEBHOOK_SECRET).update(rawBody).digest("hex")}`,
      WEBHOOK_SECRET,
    )).toBe(false);
    expect(verifyGitHubWebhookSignature(rawBody, "sha256=00", WEBHOOK_SECRET)).toBe(false);
  });
});

describe("GitHub webhook lifecycle", () => {
  it("records installation metadata and starts supplied repositories at SETUP_REQUIRED", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const response = await postWebhook(url, Buffer.from(JSON.stringify(
      installationCreatedPayload(),
    )), { "X-GitHub-Delivery": "installation-created" });

    expect(response.status).toBe(200);
    expect(store.installations.get(INSTALLATION_ID)).toMatchObject({
      accountId: 501,
      accountLogin: "limen-owner",
      accountType: "Organization",
      installedByGithubUserId: INSTALLER_GITHUB_USER_ID,
      boundByAuthUserId: null,
      connectionState: "ACTIVE",
    });
    expect(store.repositories.get(FIRST_REPOSITORY_ID)).toMatchObject({
      installationId: INSTALLATION_ID,
      lifecycleState: "SETUP_REQUIRED",
    });
  });

  it("deduplicates delivery IDs before a second lifecycle mutation", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const body = Buffer.from(JSON.stringify(installationCreatedPayload()));

    const first = await postWebhook(url, body, { "X-GitHub-Delivery": "duplicate-delivery" });
    const second = await postWebhook(url, body, { "X-GitHub-Delivery": "duplicate-delivery" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(202);
    expect(await responseBody(second)).toMatchObject({
      code: "DUPLICATE_DELIVERY",
      duplicate: true,
    });
    expect(store.mutationCount).toBe(1);
    expect(store.repositories.size).toBe(1);
  });

  it("disconnects an installation and all attached repositories without deleting history", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    store.historicalEvaluationIds.add(401);
    await postWebhook(url, Buffer.from(JSON.stringify(installationCreatedPayload([
      repository(FIRST_REPOSITORY_ID),
      repository(SECOND_REPOSITORY_ID),
    ]))), { "X-GitHub-Delivery": "installation-created" });

    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "deleted",
      installation: { id: INSTALLATION_ID },
    })), {
      "X-GitHub-Delivery": "installation-deleted",
      "X-GitHub-Event": "installation",
    });

    expect(response.status).toBe(200);
    expect(store.installations.get(INSTALLATION_ID)?.connectionState).toBe("DISCONNECTED");
    expect(store.repositories.get(FIRST_REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");
    expect(store.repositories.get(SECOND_REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");
    expect(store.historicalEvaluationIds.has(401)).toBe(true);
  });

  it("adds only repositories supplied by installation_repositories.added", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    store.repositories.set(FIRST_REPOSITORY_ID, {
      ...repository(FIRST_REPOSITORY_ID),
      installationId: INSTALLATION_ID,
      lifecycleState: "VERIFIED",
    });

    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "added",
      installation: { id: INSTALLATION_ID },
      repositories_added: [githubRepositoryPayload(repository(SECOND_REPOSITORY_ID))],
    })), {
      "X-GitHub-Delivery": "repositories-added",
      "X-GitHub-Event": "installation_repositories",
    });

    expect(response.status).toBe(200);
    expect(store.repositories.get(SECOND_REPOSITORY_ID)?.lifecycleState).toBe("SETUP_REQUIRED");
    expect(store.repositories.get(FIRST_REPOSITORY_ID)?.lifecycleState).toBe("VERIFIED");
  });

  it("disconnects only repositories supplied by installation_repositories.removed", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    store.repositories.set(FIRST_REPOSITORY_ID, {
      ...repository(FIRST_REPOSITORY_ID),
      installationId: INSTALLATION_ID,
      lifecycleState: "VERIFIED",
    });
    store.repositories.set(SECOND_REPOSITORY_ID, {
      ...repository(SECOND_REPOSITORY_ID),
      installationId: INSTALLATION_ID,
      lifecycleState: "CONFIGURED",
    });

    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "removed",
      installation: { id: INSTALLATION_ID },
      repositories_removed: [githubRepositoryPayload(repository(FIRST_REPOSITORY_ID))],
    })), {
      "X-GitHub-Delivery": "repositories-removed",
      "X-GitHub-Event": "installation_repositories",
    });

    expect(response.status).toBe(200);
    expect(store.repositories.get(FIRST_REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");
    expect(store.repositories.get(SECOND_REPOSITORY_ID)?.lifecycleState).toBe("CONFIGURED");
  });

  it.each([
    [true, "CONFIGURED", "MERGED"],
    [false, "SETUP_REQUIRED", "CLOSED"],
  ] as const)("synchronizes a tracked setup PR closed with merged=%s", async (merged, state, prState) => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    store.repositories.set(FIRST_REPOSITORY_ID, {
      ...repository(FIRST_REPOSITORY_ID),
      installationId: INSTALLATION_ID,
      lifecycleState: "SETUP_PR_OPEN",
    });
    store.setupPullRequests.set(`${FIRST_REPOSITORY_ID}:42`, { state: "OPEN" });

    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "closed",
      number: 42,
      pull_request: { merged },
      repository: { id: FIRST_REPOSITORY_ID },
    })), {
      "X-GitHub-Delivery": `setup-pr-${merged ? "merged" : "closed"}`,
      "X-GitHub-Event": "pull_request",
    });

    expect(response.status).toBe(200);
    expect(store.repositories.get(FIRST_REPOSITORY_ID)?.lifecycleState).toBe(state);
    expect(store.setupPullRequests.get(`${FIRST_REPOSITORY_ID}:42`)?.state).toBe(prState);
  });

  it("does not change onboarding state for an unrelated pull request", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    store.repositories.set(FIRST_REPOSITORY_ID, {
      ...repository(FIRST_REPOSITORY_ID),
      installationId: INSTALLATION_ID,
      lifecycleState: "SETUP_PR_OPEN",
    });
    store.setupPullRequests.set(`${FIRST_REPOSITORY_ID}:42`, { state: "OPEN" });

    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "closed",
      number: 99,
      pull_request: { merged: true },
      repository: { id: FIRST_REPOSITORY_ID },
    })), {
      "X-GitHub-Delivery": "unrelated-pr",
      "X-GitHub-Event": "pull_request",
    });

    expect(response.status).toBe(200);
    expect(store.repositories.get(FIRST_REPOSITORY_ID)?.lifecycleState).toBe("SETUP_PR_OPEN");
    expect(store.setupPullRequests.get(`${FIRST_REPOSITORY_ID}:42`)?.state).toBe("OPEN");
  });
});

describe("GitHub webhook HTTP boundary", () => {
  it("rejects invalid signatures before attempting JSON parsing", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const response = await postWebhook(url, Buffer.from("{not-json"), {
      "X-Hub-Signature-256": "sha256=not-hex",
    });

    expect(response.status).toBe(401);
    expect(await responseBody(response)).toEqual({
      code: "GITHUB_WEBHOOK_INVALID_SIGNATURE",
      message: "GitHub webhook signature is invalid.",
    });
    expect(store.deliveries.size).toBe(0);
  });

  it("rejects missing signature, delivery, and event headers", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const body = Buffer.from(JSON.stringify({ action: "created" }));

    const missingSignature = await postWebhook(url, body, {
      "X-Hub-Signature-256": undefined,
    });
    expect(missingSignature.status).toBe(400);
    expect(await responseBody(missingSignature)).toMatchObject({
      code: "GITHUB_WEBHOOK_SIGNATURE_REQUIRED",
    });

    const missingDelivery = await postWebhook(url, body, {
      "X-GitHub-Delivery": undefined,
    });
    expect(missingDelivery.status).toBe(400);
    expect(await responseBody(missingDelivery)).toMatchObject({
      code: "GITHUB_WEBHOOK_DELIVERY_REQUIRED",
    });

    const missingEvent = await postWebhook(url, body, {
      "X-GitHub-Event": undefined,
    });
    expect(missingEvent.status).toBe(400);
    expect(await responseBody(missingEvent)).toMatchObject({
      code: "GITHUB_WEBHOOK_EVENT_REQUIRED",
    });
  });

  it("returns a sanitized client error for malformed JSON after valid verification", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const body = Buffer.from("{not-json");
    const response = await postWebhook(url, body);

    expect(response.status).toBe(400);
    const result = await responseBody(response);
    expect(result).toEqual({
      code: "GITHUB_WEBHOOK_INVALID_JSON",
      message: "GitHub webhook payload must be valid JSON.",
    });
    expect(JSON.stringify(result)).not.toContain(WEBHOOK_SECRET);
  });

  it("accepts unsupported events without lifecycle mutation", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const response = await postWebhook(url, Buffer.from(JSON.stringify({ action: "opened" })), {
      "X-GitHub-Event": "push",
    });

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({ accepted: true });
    expect(store.mutationCount).toBe(0);
  });

  it("accepts unsupported actions without lifecycle mutation", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store);
    const response = await postWebhook(url, Buffer.from(JSON.stringify({
      action: "renamed",
    })), {
      "X-GitHub-Event": "installation_repositories",
    });

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({ accepted: true });
    expect(store.mutationCount).toBe(0);
  });

  it("rejects an oversized body before parsing or claiming delivery", async () => {
    const store = new FakeGitHubAppStore();
    const { url } = await startServer(store, 64);
    const body = Buffer.alloc(65, "x");
    const response = await postWebhook(url, body);

    expect(response.status).toBe(413);
    expect(await responseBody(response)).toEqual({
      code: "GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE",
      message: "GitHub webhook payload is too large.",
    });
    expect(store.deliveries.size).toBe(0);
  });

  it("does not expose the webhook secret in route failures", async () => {
    const store: GitHubAppStore = {
      claimDelivery: async () => ({ duplicate: false }),
      recordInstallationCreated: async () => {
        throw new Error(`database failed with ${WEBHOOK_SECRET}`);
      },
      disconnectInstallation: async () => undefined,
      addInstallationRepositories: async () => undefined,
      removeInstallationRepositories: async () => undefined,
      syncSetupPullRequestClosed: async () => undefined,
    };
    const { url } = await startServer(store);
    const response = await postWebhook(
      url,
      Buffer.from(JSON.stringify(installationCreatedPayload())),
    );

    expect(response.status).toBe(500);
    const body = await responseBody(response);
    expect(body).toEqual({
      code: "GITHUB_WEBHOOK_INTERNAL_ERROR",
      message: "The GitHub webhook could not be processed.",
    });
    expect(JSON.stringify(body)).not.toContain(WEBHOOK_SECRET);
  });
});
