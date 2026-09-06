import { describe, expect, it, vi } from "vitest";
import {
  createGitHubInstallationClient,
  createSetupService,
  GitHubInstallationClientError,
  SetupPersistenceError,
  type GitHubInstallationApi,
  type GitHubInstallationClientDependencies,
  type GitHubSetupTransport,
  type SetupPersistence,
  type SetupPullRequestRecord,
  type SetupRepository,
} from "../packages/github-app/src";

const INSTALLATION_ID = 201;
const REPOSITORY_ID = 301;
const INSTALLATION_TOKEN = "installation-token-that-must-not-escape";
const GITHUB_APP_PRIVATE_KEY = "private-key-that-must-not-escape";
const ACTION_SHA = "1111111111111111111111111111111111111111";

const POLICY_CONTENT = `production:
  block_severity:
    - critical
    - high
  dependency_scopes:
    - runtime
  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review
`;

const WORKFLOW_CONTENT = `name: Limen

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened

permissions:
  contents: read
  id-token: write

jobs:
  limen:
    runs-on: ubuntu-latest
    steps:
      - name: Evaluate release evidence
        uses: kaelah971/limen@${ACTION_SHA}
        with:
          github-token: \${{ github.token }}
          telegraph-private-key: \${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: \${{ vars.TELEGRAPH_ENGINE_URL }}
          limen-api-url: https://api.example.test
`;

const REPOSITORY: SetupRepository = {
  installationId: INSTALLATION_ID,
  repositoryId: REPOSITORY_ID,
  owner: "kaelah971",
  name: "limen",
  fullName: "kaelah971/limen",
  defaultBranch: "main",
};

const SETUP_CONFIG = {
  actionSha: ACTION_SHA,
  limenApiUrl: "https://api.example.test",
};

type FileState = "missing" | "present" | "malformed" | Error;

class FakeGitHubTransport implements GitHubSetupTransport {
  readonly calls: { kind: string; input: unknown; token: string }[] = [];
  readonly createdFiles: { path: string; content: string; branchName: string }[] = [];
  readonly pullRequests: { title: string; body: string; head: string; base: string }[] = [];
  readonly files = new Map<string, FileState>();
  defaultBranch = { branchName: "main", headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  branchError: Error | undefined;
  fileError: Error | undefined;
  pullRequestError: Error | undefined;

  async getRepositoryFile(
    input: { owner: string; repo: string; path: string; ref: string },
    token: string,
  ) {
    this.calls.push({ kind: "getRepositoryFile", input, token });
    const state = this.files.get(input.path) ?? "missing";
    if (state === "missing") {
      throw Object.assign(new Error("not found"), { status: 404 });
    }
    if (state instanceof Error) {
      throw state;
    }
    if (state === "malformed") {
      return { type: "file" as const, path: "unexpected-path" };
    }
    return { type: "file" as const, path: input.path };
  }

  async getDefaultBranch(
    input: { owner: string; repo: string },
    token: string,
  ) {
    this.calls.push({ kind: "getDefaultBranch", input, token });
    return this.defaultBranch;
  }

  async createBranch(
    input: { owner: string; repo: string; branchName: string; fromSha: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: "createBranch", input, token });
    if (this.branchError) {
      throw this.branchError;
    }
  }

  async createFile(
    input: { owner: string; repo: string; path: string; branchName: string; content: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: "createFile", input, token });
    if (this.fileError) {
      throw this.fileError;
    }
    this.createdFiles.push({
      path: input.path,
      content: input.content,
      branchName: input.branchName,
    });
  }

  async createPullRequest(
    input: { owner: string; repo: string; title: string; body: string; head: string; base: string },
    token: string,
  ) {
    this.calls.push({ kind: "createPullRequest", input, token });
    if (this.pullRequestError) {
      throw this.pullRequestError;
    }
    this.pullRequests.push(input);
    return {
      number: 42,
      url: "https://github.com/kaelah971/limen/pull/42",
    };
  }
}

class FakeSetupPersistence implements SetupPersistence {
  openSetupPullRequest: SetupPullRequestRecord | null = null;
  readonly lookupRepositoryIds: number[] = [];
  readonly recordedInputs: Parameters<SetupPersistence["recordSetupPullRequestAndTransition"]>[0][] = [];
  recordError: Error | undefined;

  async getOpenSetupPullRequest(repositoryId: number): Promise<SetupPullRequestRecord | null> {
    this.lookupRepositoryIds.push(repositoryId);
    return this.openSetupPullRequest;
  }

  async recordSetupPullRequestAndTransition(
    input: Parameters<SetupPersistence["recordSetupPullRequestAndTransition"]>[0],
  ): Promise<SetupPullRequestRecord> {
    this.recordedInputs.push(input);
    if (this.recordError) {
      throw this.recordError;
    }
    const record: SetupPullRequestRecord = {
      ...input,
      state: "OPEN",
    };
    this.openSetupPullRequest = record;
    return record;
  }
}

function makeInstallationClient(
  transport: FakeGitHubTransport,
  state: "ACTIVE" | "DISCONNECTED" = "ACTIVE",
) {
  const events: string[] = [];
  const getInstallationState = vi.fn(async () => {
    events.push("state");
    return state;
  });
  const mintInstallationToken = vi.fn(async () => {
    events.push("mint");
    return INSTALLATION_TOKEN;
  });
  const dependencies: GitHubInstallationClientDependencies = {
    getInstallationState,
    mintInstallationToken,
    transport,
  };
  return {
    client: createGitHubInstallationClient(dependencies),
    events,
    getInstallationState,
    mintInstallationToken,
  };
}

function makeSetupService(
  transport = new FakeGitHubTransport(),
  persistence = new FakeSetupPersistence(),
) {
  const installation = makeInstallationClient(transport);
  const service = createSetupService({
    installationClient: installation.client,
    persistence,
    setupConfig: SETUP_CONFIG,
    now: () => 1_700_000_000_000,
  });
  return { service, transport, persistence, installation };
}

describe("GitHub installation client", () => {
  it("checks state, mints immediately before API use, and never returns the token", async () => {
    const transport = new FakeGitHubTransport();
    transport.files.set("limen.yml", "present");
    const { client, events } = makeInstallationClient(transport);

    const result = await client.withInstallationClient(INSTALLATION_ID, async (github) => {
      events.push("api");
      return github.getRepositoryFile({
        owner: REPOSITORY.owner,
        repo: REPOSITORY.name,
        path: "limen.yml",
        ref: REPOSITORY.defaultBranch,
      });
    });

    expect(events).toEqual(["state", "mint", "api"]);
    expect(result).toEqual({ type: "file", path: "limen.yml" });
    expect(JSON.stringify(result)).not.toContain(INSTALLATION_TOKEN);
    expect(transport.calls[0]?.token).toBe(INSTALLATION_TOKEN);
  });

  it("invalidates a retained client after the scoped callback finishes", async () => {
    const transport = new FakeGitHubTransport();
    transport.files.set("limen.yml", "present");
    const { client } = makeInstallationClient(transport);
    let retainedClient: GitHubInstallationApi | undefined;

    await client.withInstallationClient(INSTALLATION_ID, async (github) => {
      retainedClient = github;
      return github.getRepositoryFile({
        owner: REPOSITORY.owner,
        repo: REPOSITORY.name,
        path: "limen.yml",
        ref: REPOSITORY.defaultBranch,
      });
    });

    await expect(retainedClient?.getRepositoryFile({
      owner: REPOSITORY.owner,
      repo: REPOSITORY.name,
      path: "limen.yml",
      ref: REPOSITORY.defaultBranch,
    })).rejects.toMatchObject({ code: "GITHUB_INSTALLATION_REQUEST_FAILED" });
    expect(transport.calls).toHaveLength(1);
  });

  it("rejects disconnected installations before token minting", async () => {
    const transport = new FakeGitHubTransport();
    const { client, mintInstallationToken } = makeInstallationClient(transport, "DISCONNECTED");

    await expect(client.withInstallationClient(INSTALLATION_ID, async () => undefined))
      .rejects.toMatchObject({ code: "GITHUB_INSTALLATION_DISCONNECTED" });
    expect(mintInstallationToken).not.toHaveBeenCalled();
    expect(transport.calls).toHaveLength(0);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    ("rejects invalid installation ID %s before state lookup", async (installationId) => {
      const transport = new FakeGitHubTransport();
      const { client, getInstallationState } = makeInstallationClient(transport);

      await expect(client.withInstallationClient(installationId, async () => undefined))
        .rejects.toMatchObject({ code: "GITHUB_INSTALLATION_INVALID" });
      expect(getInstallationState).not.toHaveBeenCalled();
    });

  it("sanitizes transport errors so tokens and private keys cannot escape", async () => {
    const transport = new FakeGitHubTransport();
    transport.fileError = new Error(`${INSTALLATION_TOKEN} ${GITHUB_APP_PRIVATE_KEY}`);
    const { client } = makeInstallationClient(transport);

    const error = await client.withInstallationClient(INSTALLATION_ID, async (github) =>
      github.getRepositoryFile({
        owner: REPOSITORY.owner,
        repo: REPOSITORY.name,
        path: "limen.yml",
        ref: REPOSITORY.defaultBranch,
      }),
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(GitHubInstallationClientError);
    expect(String(error)).not.toContain(INSTALLATION_TOKEN);
    expect(String(error)).not.toContain(GITHUB_APP_PRIVATE_KEY);
  });

  it("sanitizes token-minting failures without exposing the private key", async () => {
    const transport = new FakeGitHubTransport();
    const installation = makeInstallationClient(transport);
    installation.mintInstallationToken.mockRejectedValueOnce(
      new Error(`failed with ${GITHUB_APP_PRIVATE_KEY}`),
    );

    const error = await installation.client
      .withInstallationClient(INSTALLATION_ID, async () => undefined)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(GitHubInstallationClientError);
    expect(String(error)).not.toContain(GITHUB_APP_PRIVATE_KEY);
    expect(transport.calls).toHaveLength(0);
  });
});

describe("GitHub setup preview", () => {
  it("proposes exactly the two required files for an empty repository", async () => {
    const { service, transport } = makeSetupService();

    const preview = await service.inspectSetup(REPOSITORY);

    expect(preview).toEqual({
      files: [
        { path: "limen.yml", status: "missing", content: POLICY_CONTENT },
        {
          path: ".github/workflows/limen.yml",
          status: "missing",
          content: WORKFLOW_CONTENT,
        },
      ],
      filesToCreate: ["limen.yml", ".github/workflows/limen.yml"],
      alreadyConfigured: false,
    });
    expect(transport.calls.map((call) => call.kind)).toEqual([
      "getRepositoryFile",
      "getRepositoryFile",
      "getRepositoryFile",
    ]);
    expect(transport.calls.every((call) =>
      (call.input as { ref?: string }).ref === REPOSITORY.defaultBranch,
    )).toBe(true);
  });

  it.each(["limen.yml", "limen.yaml"])(
    "does not overwrite an existing %s policy",
    async (policyPath) => {
      const { service, transport } = makeSetupService();
      transport.files.set(policyPath, "present");

      const result = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG);

      expect(result.code).toBe("SETUP_PR_CREATED");
      expect(transport.createdFiles.map((file) => file.path)).toEqual([
        ".github/workflows/limen.yml",
      ]);
      expect(transport.createdFiles.some((file) => file.path === policyPath)).toBe(false);
    },
  );

  it("does not overwrite an existing workflow and creates only the missing policy", async () => {
    const { service, transport } = makeSetupService();
    transport.files.set(".github/workflows/limen.yml", "present");

    const result = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG);

    expect(result.code).toBe("SETUP_PR_CREATED");
    expect(transport.createdFiles).toEqual([{
      path: "limen.yml",
      content: POLICY_CONTENT,
      branchName: "limen/setup-301-1700000000",
    }]);
  });

  it("returns ALREADY_CONFIGURED_FILES_PRESENT without creating branch, files, or PR", async () => {
    const { service, transport, persistence, installation } = makeSetupService();
    transport.files.set("limen.yml", "present");
    transport.files.set(".github/workflows/limen.yml", "present");

    const result = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG);

    expect(result.code).toBe("ALREADY_CONFIGURED_FILES_PRESENT");
    expect(transport.calls.map((call) => call.kind)).not.toContain("getDefaultBranch");
    expect(transport.calls.map((call) => call.kind)).not.toContain("createBranch");
    expect(transport.createdFiles).toHaveLength(0);
    expect(transport.pullRequests).toHaveLength(0);
    expect(persistence.recordedInputs).toHaveLength(0);
    expect(installation.mintInstallationToken).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate limited"],
  ] as const)("treats HTTP %s file lookup as an inspection failure", async (status, message) => {
    const { service, transport } = makeSetupService();
    transport.files.set("limen.yml", Object.assign(new Error(message), { status }));

    await expect(service.inspectSetup(REPOSITORY)).rejects.toMatchObject({
      code: "SETUP_INSPECTION_FAILED",
    });
  });

  it("treats network and malformed responses as inspection failures, not missing files", async () => {
    const network = makeSetupService();
    network.transport.files.set("limen.yml", new Error("network failure"));
    await expect(network.service.inspectSetup(REPOSITORY)).rejects.toMatchObject({
      code: "SETUP_INSPECTION_FAILED",
    });

    const malformed = makeSetupService();
    malformed.transport.files.set("limen.yml", "malformed");
    await expect(malformed.service.inspectSetup(REPOSITORY)).rejects.toMatchObject({
      code: "SETUP_INSPECTION_FAILED",
    });
  });
});

describe("GitHub setup pull request generation", () => {
  it("returns an existing open setup PR before minting a token or writing to GitHub", async () => {
    const { service, transport, persistence, installation } = makeSetupService();
    const existing: SetupPullRequestRecord = {
      repositoryId: REPOSITORY_ID,
      prNumber: 7,
      prUrl: "https://github.com/kaelah971/limen/pull/7",
      branchName: "limen/setup-301-1699999999",
      state: "OPEN",
    };
    persistence.openSetupPullRequest = existing;

    const result = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG);

    expect(result).toEqual({
      code: "OPEN_SETUP_PR_EXISTS",
      setupPullRequest: existing,
    });
    expect(installation.mintInstallationToken).not.toHaveBeenCalled();
    expect(transport.calls).toHaveLength(0);
    expect(persistence.recordedInputs).toHaveLength(0);
  });

  it("reads the default branch before creating a unique branch, only missing files, and the exact PR", async () => {
    const { service, transport, persistence } = makeSetupService();

    const result = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG);

    expect(result).toMatchObject({
      code: "SETUP_PR_CREATED",
      setupPullRequest: {
        repositoryId: REPOSITORY_ID,
        prNumber: 42,
        prUrl: "https://github.com/kaelah971/limen/pull/42",
        branchName: "limen/setup-301-1700000000",
        state: "OPEN",
      },
    });
    expect(transport.calls.map((call) => call.kind)).toEqual([
      "getRepositoryFile",
      "getRepositoryFile",
      "getRepositoryFile",
      "getDefaultBranch",
      "createBranch",
      "createFile",
      "createFile",
      "createPullRequest",
    ]);
    expect(transport.createdFiles).toEqual([
      {
        path: "limen.yml",
        content: POLICY_CONTENT,
        branchName: "limen/setup-301-1700000000",
      },
      {
        path: ".github/workflows/limen.yml",
        content: WORKFLOW_CONTENT,
        branchName: "limen/setup-301-1700000000",
      },
    ]);
    expect(transport.pullRequests).toHaveLength(1);
    expect(transport.pullRequests[0]).toMatchObject({
      title: "Configure Limen release evidence gate",
      head: "limen/setup-301-1700000000",
      base: "main",
    });
    expect(transport.pullRequests[0]?.body).toContain(
      "Add `LIMEN_TELEGRAPH_PRIVATE_KEY` to the GitHub repository Secrets",
    );
    expect(transport.pullRequests[0]?.body).toContain(
      "Add `TELEGRAPH_ENGINE_URL` to the GitHub repository Variables",
    );
    expect(transport.pullRequests[0]?.body).toContain(
      "Never paste the Telegraph private key into Limen",
    );
    expect(transport.pullRequests[0]?.body).toContain(
      "Review or edit `limen.yml` before merging",
    );
    expect(transport.pullRequests[0]?.body).toContain(
      "VERIFIED only after the first accepted real evaluation",
    );
    expect(transport.pullRequests[0]?.body).not.toContain("telegraph.example");
    expect(transport.pullRequests[0]?.body).not.toContain("private-key-that-must-not-escape");
    expect(persistence.recordedInputs).toEqual([{
      repositoryId: REPOSITORY_ID,
      prNumber: 42,
      prUrl: "https://github.com/kaelah971/limen/pull/42",
      branchName: "limen/setup-301-1700000000",
    }]);
    expect(persistence.openSetupPullRequest?.state).toBe("OPEN");
  });

  it.each([
    ["branch", "SETUP_GITHUB_ERROR"],
    ["file", "SETUP_GITHUB_ERROR"],
    ["pull request", "SETUP_GITHUB_ERROR"],
  ] as const)("returns a typed error when %s creation fails", async (failure, code) => {
    const { service, transport, persistence } = makeSetupService();
    if (failure === "branch") {
      transport.branchError = new Error(INSTALLATION_TOKEN);
    } else if (failure === "file") {
      transport.fileError = new Error(INSTALLATION_TOKEN);
    } else {
      transport.pullRequestError = new Error(INSTALLATION_TOKEN);
    }

    const error = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG)
      .catch((caught) => caught);

    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain(INSTALLATION_TOKEN);
    expect(persistence.recordedInputs).toHaveLength(0);
  });

  it("returns an explicit persistence error after GitHub creates the PR", async () => {
    const { service, transport, persistence } = makeSetupService();
    persistence.recordError = new Error(`${INSTALLATION_TOKEN} database failure`);

    const error = await service.createSetupPullRequest(REPOSITORY, SETUP_CONFIG)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(SetupPersistenceError);
    expect(String(error)).not.toContain(INSTALLATION_TOKEN);
    expect(transport.pullRequests).toHaveLength(1);
    expect(persistence.recordedInputs).toHaveLength(1);
  });

  it("rejects invalid generation config before GitHub writes", async () => {
    const { service, transport, persistence } = makeSetupService();

    await expect(service.createSetupPullRequest(REPOSITORY, {
      actionSha: "not-a-sha",
      limenApiUrl: "https://api.example.test",
    })).rejects.toMatchObject({ code: "SETUP_CONFIG_INVALID" });
    expect(transport.calls).toHaveLength(0);
    expect(persistence.recordedInputs).toHaveLength(0);
  });
});
