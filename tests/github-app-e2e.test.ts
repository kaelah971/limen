import { createHmac } from "node:crypto";
import type { AddressInfo, Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLimenWorkflow,
  createGitHubInstallationClient,
  createSetupService,
  DEFAULT_LIMEN_POLICY,
  type GitHubActionsOidcVerifier,
  type GitHubSetupTransport,
  type SetupPullRequestRecord,
} from "../packages/github-app/src";
import { createLedgerServer } from "../apps/api/src/server";
import type {
  GitHubAppStore,
  GitHubEvaluationInput,
  GitHubEvaluationRepositoryRecord,
  GitHubEvaluationStore,
  GitHubEvaluationRecord,
  GitHubHistoricalEvaluationRecord,
  GitHubInstallationAuthorizationStore,
  GitHubInstallationRecord,
  GitHubIntegrationHealthInput,
  GitHubIntegrationHealthStore,
  GitHubRepositoryMetadata,
  GitHubRepositoryRecord,
  GitHubRepositorySetupPullRequestRecord,
  GitHubRepositoryStore,
  GitHubUserInput,
  InstallationCreatedInput,
  SetupPullRequestClosedInput,
} from "../apps/api/src/github-app-store";
import { GitHubEvaluationPersistenceError } from "../apps/api/src/github-app-store";
import type {
  SupabaseAuthUser,
  UserAuthClient,
} from "../apps/api/src/user-auth";
import { createObservabilityLogger } from "../packages/core/src";

const INSTALLATION_ID = 201;
const ACCOUNT_ID = 501;
const REPOSITORY_ID = 301;
const INSTALLER_GITHUB_USER_ID = 101;
const OTHER_GITHUB_USER_ID = 202;
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "supabase-access-token-fixture";
const OTHER_ACCESS_TOKEN = "other-supabase-access-token-fixture";
const WEBHOOK_SECRET = "github-webhook-secret-fixture-0123456789";
const INSTALLATION_TOKEN = "github-installation-token-fixture";
const OIDC_TOKEN_PREFIX = "github-oidc-jwt-fixture";
const GITHUB_APP_PRIVATE_KEY = "github-app-private-key-fixture";
const SUPABASE_SERVICE_ROLE_KEY = "supabase-service-role-key-fixture";
const GITHUB_OAUTH_TOKEN = "github-oauth-token-fixture";
const TELEGRAPH_PRIVATE_KEY = "telegraph-private-key-fixture";
const ACTION_SHA = "1111111111111111111111111111111111111111";
const WORKFLOW_REF = "kaelah971/limen-demo/.github/workflows/limen.yml@refs/heads/main";
const BASE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EVALUATION_TIMES = {
  pass: "2026-09-06T01:00:00.000Z",
  hold: "2026-09-06T02:00:00.000Z",
  review: "2026-09-06T03:00:00.000Z",
  recovery: "2026-09-06T04:00:00.000Z",
  readded: "2026-09-06T05:00:00.000Z",
};

type Decision = "PASS" | "HOLD" | "REVIEW";
type SetupPullRequestState = "OPEN" | "MERGED" | "CLOSED";

interface InstallationFixture extends GitHubInstallationRecord {
  accountId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
}

interface RepositoryFixture extends GitHubRepositoryRecord {
  setupPullRequest: GitHubRepositorySetupPullRequestRecord | null;
}

interface SetupPullRequestFixture {
  record: SetupPullRequestRecord;
  state: SetupPullRequestState;
}

interface EvaluationFixture extends GitHubEvaluationRecord {
  repositoryId: number;
  githubRunId: number;
  githubRunAttempt: number;
  workflowRef: string;
  commitSha: string;
  decision: Decision;
  receiptId: string | null;
  evaluatedAt: string;
}

interface FixtureResponses {
  body: unknown;
  status: number;
}

function repositoryMetadata(): GitHubRepositoryMetadata {
  return {
    repositoryId: REPOSITORY_ID,
    ownerLogin: "kaelah971",
    repositoryName: "limen-demo",
    fullName: "kaelah971/limen-demo",
    defaultBranch: "main",
  };
}

function repositoryPayload(metadata: GitHubRepositoryMetadata): Record<string, unknown> {
  return {
    id: metadata.repositoryId,
    name: metadata.repositoryName,
    full_name: metadata.fullName,
    default_branch: metadata.defaultBranch,
    owner: { login: metadata.ownerLogin },
  };
}

function installationCreatedPayload(): Record<string, unknown> {
  const metadata = repositoryMetadata();
  return {
    action: "created",
    installation: {
      id: INSTALLATION_ID,
      account: {
        id: ACCOUNT_ID,
        login: "limen-demo-org",
        type: "Organization",
      },
      repositories: [repositoryPayload(metadata)],
    },
    sender: {
      id: INSTALLER_GITHUB_USER_ID,
      login: "installer",
    },
  };
}

function installationDeletedPayload(): Record<string, unknown> {
  return {
    action: "deleted",
    installation: { id: INSTALLATION_ID },
  };
}

function installationRepositoriesPayload(
  action: "added" | "removed",
): Record<string, unknown> {
  return {
    action,
    installation: { id: INSTALLATION_ID },
    ...(action === "added"
      ? { repositories_added: [repositoryPayload(repositoryMetadata())] }
      : { repositories_removed: [repositoryPayload(repositoryMetadata())] }),
  };
}

function setupPullRequestClosedPayload(
  pullRequestNumber: number,
): Record<string, unknown> {
  return {
    action: "closed",
    number: pullRequestNumber,
    pull_request: {
      number: pullRequestNumber,
      merged: true,
    },
    repository: { id: REPOSITORY_ID },
  };
}

function sign(rawBody: string): string {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex")}`;
}

function githubUser(
  authUserId: string,
  githubUserId: number,
  login: string,
): SupabaseAuthUser {
  return {
    id: authUserId,
    identities: [{
      provider: "github",
      identity_data: {
        provider_id: String(githubUserId),
        user_name: login,
        access_token: GITHUB_OAUTH_TOKEN,
      },
    }],
  };
}

function makeOidcClaims(
  runId: number,
  runAttempt: number,
  workflowRef = WORKFLOW_REF,
): Record<string, unknown> {
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: "limen-api",
    repository: "kaelah971/limen-demo",
    repository_id: String(REPOSITORY_ID),
    run_id: String(runId),
    run_attempt: String(runAttempt),
    workflow_ref: workflowRef,
    sha: BASE_SHA,
  };
}

function evaluationBody(
  runId: number,
  runAttempt: number,
  decision: Decision,
  evaluatedAt: string,
  workflowRef = WORKFLOW_REF,
): Record<string, unknown> {
  return {
    repositoryId: REPOSITORY_ID,
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    workflowRef,
    commitSha: BASE_SHA,
    decision,
    receiptId: null,
    evaluatedAt,
  };
}

function healthBody(
  runId: number,
  runAttempt: number,
  observedAt: string,
): Record<string, unknown> {
  return {
    repositoryId: REPOSITORY_ID,
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    workflowRef: WORKFLOW_REF,
    code: "CONFIGURATION_INVALID",
    observedAt,
  };
}

class FakeP18Store implements
  GitHubAppStore,
  GitHubInstallationAuthorizationStore,
  GitHubRepositoryStore,
  GitHubEvaluationStore,
  GitHubIntegrationHealthStore {
  readonly deliveries = new Set<string>();
  readonly users = new Map<string, GitHubUserInput>();
  readonly installations = new Map<number, InstallationFixture>();
  readonly repositories = new Map<number, RepositoryFixture>();
  readonly setupPullRequests = new Map<string, SetupPullRequestFixture>();
  readonly evaluations = new Map<string, EvaluationFixture>();
  readonly historicalEvaluations = new Map<number, GitHubHistoricalEvaluationRecord[]>();
  readonly healthReports = new Set<string>();
  readonly recordedSetupInputs: Parameters<GitHubRepositoryStore["recordSetupPullRequestAndTransition"]>[0][] = [];
  readonly recordedEvaluationInputs: GitHubEvaluationInput[] = [];
  readonly recordedHealthInputs: GitHubIntegrationHealthInput[] = [];
  installationCreatedCount = 0;
  disconnectCount = 0;
  repositoryRemovalCount = 0;
  repositoryAddCount = 0;
  setupTransitionCount = 0;
  healthTransitionCount = 0;

  async claimDelivery(deliveryId: string): Promise<{ duplicate: boolean }> {
    if (this.deliveries.has(deliveryId)) {
      return { duplicate: true };
    }
    this.deliveries.add(deliveryId);
    return { duplicate: false };
  }

  async recordInstallationCreated(input: InstallationCreatedInput): Promise<void> {
    this.installationCreatedCount += 1;
    this.installations.set(input.installationId, {
      installationId: input.installationId,
      accountId: input.accountId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      installedByGithubUserId: input.installedByGithubUserId,
      boundByAuthUserId: null,
      connectionState: "ACTIVE",
    });
    for (const metadata of input.repositories) {
      const existing = this.repositories.get(metadata.repositoryId);
      this.repositories.set(metadata.repositoryId, {
        repositoryId: metadata.repositoryId,
        installationId: input.installationId,
        ownerLogin: metadata.ownerLogin,
        repositoryName: metadata.repositoryName,
        fullName: metadata.fullName,
        defaultBranch: metadata.defaultBranch,
        lifecycleState: "SETUP_REQUIRED",
        latestDecision: existing?.latestDecision ?? null,
        latestEvaluationAt: existing?.latestEvaluationAt ?? null,
        setupPullRequest: null,
      });
    }
  }

  async disconnectInstallation(installationId: number): Promise<void> {
    this.disconnectCount += 1;
    const installation = this.installations.get(installationId);
    if (installation !== undefined) {
      installation.connectionState = "DISCONNECTED";
    }
    for (const repository of this.repositories.values()) {
      if (repository.installationId === installationId) {
        repository.lifecycleState = "DISCONNECTED";
      }
    }
  }

  async addInstallationRepositories(
    installationId: number,
    repositories: readonly GitHubRepositoryMetadata[],
  ): Promise<void> {
    this.repositoryAddCount += 1;
    for (const metadata of repositories) {
      const existing = this.repositories.get(metadata.repositoryId);
      this.repositories.set(metadata.repositoryId, {
        repositoryId: metadata.repositoryId,
        installationId,
        ownerLogin: metadata.ownerLogin,
        repositoryName: metadata.repositoryName,
        fullName: metadata.fullName,
        defaultBranch: metadata.defaultBranch,
        lifecycleState: "SETUP_REQUIRED",
        latestDecision: existing?.latestDecision ?? null,
        latestEvaluationAt: existing?.latestEvaluationAt ?? null,
        setupPullRequest: null,
      });
    }
  }

  async removeInstallationRepositories(
    installationId: number,
    repositoryIds: readonly number[],
  ): Promise<void> {
    this.repositoryRemovalCount += 1;
    for (const repositoryId of repositoryIds) {
      const repository = this.repositories.get(repositoryId);
      if (repository?.installationId === installationId) {
        repository.lifecycleState = "DISCONNECTED";
      }
    }
  }

  async syncSetupPullRequestClosed(input: SetupPullRequestClosedInput): Promise<void> {
    const key = `${input.repositoryId}:${input.pullRequestNumber}`;
    const setupPullRequest = this.setupPullRequests.get(key);
    if (setupPullRequest === undefined || setupPullRequest.state !== "OPEN") {
      return;
    }
    setupPullRequest.state = input.merged ? "MERGED" : "CLOSED";
    const repository = this.repositories.get(input.repositoryId);
    if (repository !== undefined) {
      repository.lifecycleState = input.merged ? "CONFIGURED" : "SETUP_REQUIRED";
      repository.setupPullRequest = null;
    }
  }

  async upsertGitHubUser(input: GitHubUserInput): Promise<void> {
    this.users.set(input.authUserId, input);
  }

  async getInstallation(installationId: number): Promise<GitHubInstallationRecord | null> {
    return this.installations.get(installationId) ?? null;
  }

  async bindInstallation(
    installationId: number,
    authUserId: string,
  ): Promise<"BOUND" | "ALREADY_BOUND"> {
    const installation = this.installations.get(installationId);
    if (installation === undefined) {
      throw new Error("INSTALLATION_NOT_CONFIRMED");
    }
    if (installation.connectionState === "DISCONNECTED") {
      throw new Error("INSTALLATION_DISCONNECTED");
    }
    if (installation.boundByAuthUserId === authUserId) {
      return "ALREADY_BOUND";
    }
    if (installation.boundByAuthUserId !== null) {
      throw new Error("INSTALLATION_ALREADY_BOUND");
    }
    installation.boundByAuthUserId = authUserId;
    return "BOUND";
  }

  async listAuthorizedRepositories(authUserId: string): Promise<GitHubRepositoryRecord[]> {
    return [...this.repositories.values()]
      .filter((repository) => {
        const installation = this.installations.get(repository.installationId);
        return installation?.boundByAuthUserId === authUserId
          && installation.connectionState === "ACTIVE"
          && repository.lifecycleState !== "DISCONNECTED";
      })
      .sort((left, right) => left.repositoryId - right.repositoryId)
      .map((repository) => this.repositoryResponse(repository));
  }

  async getAuthorizedRepository(
    repositoryId: number,
    authUserId: string,
  ): Promise<GitHubRepositoryRecord | null> {
    const repository = this.repositories.get(repositoryId);
    const installation = repository === undefined
      ? undefined
      : this.installations.get(repository.installationId);
    if (repository === undefined || installation?.boundByAuthUserId !== authUserId) {
      return null;
    }
    return this.repositoryResponse(repository);
  }

  async getInstallationState(installationId: number): Promise<"ACTIVE" | "DISCONNECTED"> {
    const installation = this.installations.get(installationId);
    if (installation === undefined) {
      throw new Error("INSTALLATION_NOT_CONFIRMED");
    }
    return installation.connectionState;
  }

  async getOpenSetupPullRequest(repositoryId: number): Promise<SetupPullRequestRecord | null> {
    return this.openSetupPullRequestFor(repositoryId);
  }

  async recordSetupPullRequestAndTransition(
    input: Parameters<GitHubRepositoryStore["recordSetupPullRequestAndTransition"]>[0],
  ): Promise<SetupPullRequestRecord> {
    this.recordedSetupInputs.push(input);
    const record: SetupPullRequestRecord = { ...input, state: "OPEN" };
    this.setupPullRequests.set(`${input.repositoryId}:${input.prNumber}`, {
      record,
      state: "OPEN",
    });
    const repository = this.repositories.get(input.repositoryId);
    if (repository === undefined) {
      throw new Error("GITHUB_REPOSITORY_NOT_FOUND");
    }
    repository.setupPullRequest = record;
    repository.lifecycleState = "SETUP_PR_OPEN";
    this.setupTransitionCount += 1;
    return record;
  }

  async listAuthorizedRepositoryEvaluations(
    repositoryId: number,
    authUserId: string,
    limit: number,
  ): Promise<GitHubHistoricalEvaluationRecord[] | null> {
    const repository = this.repositories.get(repositoryId);
    const installation = repository === undefined
      ? undefined
      : this.installations.get(repository.installationId);
    if (installation?.boundByAuthUserId !== authUserId) {
      return null;
    }
    return (this.historicalEvaluations.get(repositoryId) ?? []).slice(0, limit);
  }

  async getEvaluationRepository(
    repositoryId: number,
  ): Promise<GitHubEvaluationRepositoryRecord | null> {
    const repository = this.repositories.get(repositoryId);
    if (repository === undefined) {
      return null;
    }
    const installation = this.installations.get(repository.installationId);
    if (installation === undefined) {
      return null;
    }
    return {
      repositoryId,
      installationId: repository.installationId,
      fullName: repository.fullName,
      installationConnectionState: installation.connectionState,
      lifecycleState: repository.lifecycleState,
    };
  }

  async recordGitHubEvaluation(input: GitHubEvaluationInput): Promise<GitHubEvaluationRecord> {
    const key = `${input.repositoryId}:${input.githubRunId}:${input.githubRunAttempt}`;
    const existing = this.evaluations.get(key);
    if (existing !== undefined) {
      if (
        existing.workflowRef !== input.workflowRef
        || existing.commitSha !== input.commitSha
        || existing.decision !== input.decision
        || existing.receiptId !== input.receiptId
        || existing.evaluatedAt !== input.evaluatedAt
      ) {
        throw new GitHubEvaluationPersistenceError(
          "GITHUB_EVALUATION_CONFLICT",
          "This GitHub evaluation already exists with different evidence.",
        );
      }
      return existing;
    }

    const record: EvaluationFixture = {
      id: `evaluation-${this.evaluations.size + 1}`,
      ...input,
    };
    this.evaluations.set(key, record);
    this.recordedEvaluationInputs.push(input);
    const history = this.historicalEvaluations.get(input.repositoryId) ?? [];
    history.unshift({
      githubRunId: input.githubRunId,
      githubRunAttempt: input.githubRunAttempt,
      workflowRef: input.workflowRef,
      commitSha: input.commitSha,
      decision: input.decision,
      receiptId: input.receiptId,
      evaluatedAt: input.evaluatedAt,
    });
    this.historicalEvaluations.set(input.repositoryId, history);
    const repository = this.repositories.get(input.repositoryId);
    if (repository !== undefined) {
      repository.latestDecision = input.decision;
      repository.latestEvaluationAt = input.evaluatedAt;
      repository.lifecycleState = "VERIFIED";
    }
    return record;
  }

  async markRepositoryNeedsAttention(input: GitHubIntegrationHealthInput): Promise<void> {
    const key = `${input.repositoryId}:${input.observedAt}`;
    if (this.healthReports.has(key)) {
      return;
    }
    this.healthReports.add(key);
    this.recordedHealthInputs.push(input);
    const repository = this.repositories.get(input.repositoryId);
    if (repository !== undefined) {
      repository.lifecycleState = "NEEDS_ATTENTION";
      this.healthTransitionCount += 1;
    }
  }

  private repositoryResponse(repository: RepositoryFixture): RepositoryFixture {
    return {
      ...repository,
      setupPullRequest: this.latestSetupPullRequestFor(repository.repositoryId),
    };
  }

  private openSetupPullRequestFor(repositoryId: number): SetupPullRequestRecord | null {
    const setupPullRequests = [...this.setupPullRequests.values()].reverse();
    const setupPullRequest = setupPullRequests.find((candidate) =>
      candidate.record.repositoryId === repositoryId && candidate.state === "OPEN");
    return setupPullRequest?.record ?? null;
  }

  private latestSetupPullRequestFor(
    repositoryId: number,
  ): GitHubRepositorySetupPullRequestRecord | null {
    const setupPullRequests = [...this.setupPullRequests.values()].reverse();
    const setupPullRequest = setupPullRequests.find((candidate) =>
      candidate.record.repositoryId === repositoryId);
    return setupPullRequest === undefined
      ? null
      : { ...setupPullRequest.record, state: setupPullRequest.state };
  }
}

class FakeRepositoryTransport implements GitHubSetupTransport {
  readonly calls: { kind: string; token: string }[] = [];
  readonly createdFiles: { path: string; content: string; branchName: string }[] = [];
  readonly pullRequests: { title: string; body: string; head: string; base: string }[] = [];
  readonly files = new Map<string, "missing" | "present">();

  async getRepositoryFile(
    input: { owner: string; repo: string; path: string; ref: string },
    token: string,
  ) {
    this.calls.push({ kind: `get:${input.path}`, token });
    if (this.files.get(input.path) !== "present") {
      throw Object.assign(new Error("not found"), { status: 404 });
    }
    return { type: "file" as const, path: input.path };
  }

  async getDefaultBranch(
    _input: { owner: string; repo: string },
    token: string,
  ) {
    this.calls.push({ kind: "default-branch", token });
    return {
      branchName: "main",
      headSha: BASE_SHA,
    };
  }

  async createBranch(
    _input: { owner: string; repo: string; branchName: string; fromSha: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: "create-branch", token });
  }

  async createFile(
    input: { owner: string; repo: string; path: string; branchName: string; content: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: `create-file:${input.path}`, token });
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
    this.calls.push({ kind: "create-pull-request", token });
    this.pullRequests.push(input);
    return {
      number: 42 + this.pullRequests.length - 1,
      url: `https://github.com/kaelah971/limen-demo/pull/${42 + this.pullRequests.length - 1}`,
    };
  }
}

interface P18Fixture {
  store: FakeP18Store;
  transport: FakeRepositoryTransport;
  oidcClaims: Map<string, Record<string, unknown>>;
  logs: string[];
  authClient: UserAuthClient;
  server: Server;
  url: string;
}

function createAuthClient(): UserAuthClient {
  const users = new Map<string, SupabaseAuthUser>([
    [ACCESS_TOKEN, githubUser(AUTH_USER_ID, INSTALLER_GITHUB_USER_ID, "installer")],
    [OTHER_ACCESS_TOKEN, githubUser(OTHER_AUTH_USER_ID, OTHER_GITHUB_USER_ID, "other-user")],
  ]);
  return {
    auth: {
      getUser: async (accessToken) => ({
        data: { user: users.get(accessToken) ?? null },
        error: users.has(accessToken) ? null : new Error("invalid Supabase access token"),
      }),
    },
  };
}

async function createFixture(): Promise<P18Fixture> {
  const store = new FakeP18Store();
  const transport = new FakeRepositoryTransport();
  const oidcClaims = new Map<string, Record<string, unknown>>();
  const logs: string[] = [];
  const authClient = createAuthClient();
  const oidcVerifier: GitHubActionsOidcVerifier = async (token) => {
    const claims = oidcClaims.get(token);
    if (claims === undefined) {
      throw new Error("unknown OIDC token");
    }
    return { payload: claims };
  };
  const installationClient = createGitHubInstallationClient({
    getInstallationState: (installationId) => store.getInstallationState(installationId),
    mintInstallationToken: async () => INSTALLATION_TOKEN,
    transport,
  });
  const setupService = createSetupService({
    installationClient,
    persistence: store,
    setupConfig: {
      actionSha: ACTION_SHA,
      limenApiUrl: "https://api.example.test",
    },
    now: () => 1_700_000_000_000 + transport.pullRequests.length * 1_000,
  });
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-E2E-FIXTURE", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ledger-ingest-token-fixture",
    githubWebhook: {
      secret: WEBHOOK_SECRET,
      store,
    },
    githubInstallationBind: {
      authClient,
      store,
    },
    githubRepositoryApi: {
      authClient,
      store,
      setupService,
      setupConfig: {
        actionSha: ACTION_SHA,
        limenApiUrl: "https://api.example.test",
      },
    },
    githubEvaluationApi: {
      store,
      oidcAudience: "limen-api",
      oidcVerifier,
    },
    githubIntegrationHealthApi: {
      store,
      oidcAudience: "limen-api",
      oidcVerifier,
    },
    observability: createObservabilityLogger({
      info: (message) => logs.push(message),
      warning: (message) => logs.push(message),
      error: (message) => logs.push(message),
    }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  return {
    store,
    transport,
    oidcClaims,
    logs,
    authClient,
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startFixture(): Promise<P18Fixture> {
  const fixture = await createFixture();
  servers.push(fixture.server);
  return fixture;
}

async function postWebhook(
  fixture: P18Fixture,
  deliveryId: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<FixtureResponses> {
  const rawBody = JSON.stringify(payload);
  const response = await fetch(`${fixture.url}/v1/github/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Hub-Signature-256": sign(rawBody),
      "X-GitHub-Delivery": deliveryId,
      "X-GitHub-Event": eventName,
    },
    body: rawBody,
  });
  return { status: response.status, body: await response.json() as unknown };
}

async function apiRequest(
  fixture: P18Fixture,
  path: string,
  token = ACCESS_TOKEN,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<FixtureResponses> {
  const response = await fetch(`${fixture.url}${path}`, {
    method,
    headers: {
      ...(token === "" ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as unknown };
}

function registerOidc(
  fixture: P18Fixture,
  runId: number,
  runAttempt: number,
  workflowRef = WORKFLOW_REF,
): string {
  const token = `${OIDC_TOKEN_PREFIX}-${runId}-${runAttempt}`;
  fixture.oidcClaims.set(token, makeOidcClaims(runId, runAttempt, workflowRef));
  return token;
}

function assertNoFixtureSecret(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of [
    GITHUB_APP_PRIVATE_KEY,
    WEBHOOK_SECRET,
    INSTALLATION_TOKEN,
    SUPABASE_SERVICE_ROLE_KEY,
    ACCESS_TOKEN,
    OTHER_ACCESS_TOKEN,
    GITHUB_OAUTH_TOKEN,
    TELEGRAPH_PRIVATE_KEY,
  ]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("P18 deterministic GitHub App onboarding fixture", () => {
  it("proves the complete authenticated onboarding and recovery lifecycle", async () => {
    const fixture = await startFixture();
    const responses: unknown[] = [];

    const installation = await postWebhook(
      fixture,
      "installation-created-201",
      "installation",
      installationCreatedPayload(),
    );
    responses.push(installation.body);
    expect(installation.status).toBe(200);
    expect(fixture.store.installations.get(INSTALLATION_ID)).toMatchObject({
      connectionState: "ACTIVE",
      installedByGithubUserId: INSTALLER_GITHUB_USER_ID,
      boundByAuthUserId: null,
    });
    expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
      lifecycleState: "SETUP_REQUIRED",
      latestDecision: null,
      latestEvaluationAt: null,
    });

    const duplicateInstallation = await postWebhook(
      fixture,
      "installation-created-201",
      "installation",
      installationCreatedPayload(),
    );
    responses.push(duplicateInstallation.body);
    expect(duplicateInstallation.status).toBe(202);
    expect(duplicateInstallation.body).toMatchObject({ code: "DUPLICATE_DELIVERY", duplicate: true });
    expect(fixture.store.installationCreatedCount).toBe(1);

    const bind = await apiRequest(
      fixture,
      `/v1/github/installations/${INSTALLATION_ID}/bind`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(bind.body);
    expect(bind.status).toBe(200);
    expect(bind.body).toMatchObject({ bound: true, installationId: INSTALLATION_ID });
    expect(fixture.store.installations.get(INSTALLATION_ID)?.boundByAuthUserId).toBe(AUTH_USER_ID);

    const duplicateBind = await apiRequest(
      fixture,
      `/v1/github/installations/${INSTALLATION_ID}/bind`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(duplicateBind.body);
    expect(duplicateBind.status).toBe(200);
    expect(duplicateBind.body).toMatchObject({ bound: true, alreadyBound: true });

    const repositories = await apiRequest(fixture, "/v1/github/repositories");
    responses.push(repositories.body);
    expect(repositories.status).toBe(200);
    expect(repositories.body).toEqual({
      repositories: [{
        repositoryId: REPOSITORY_ID,
        owner: "kaelah971",
        name: "limen-demo",
        fullName: "kaelah971/limen-demo",
        defaultBranch: "main",
        lifecycleState: "SETUP_REQUIRED",
        latestDecision: null,
        latestEvaluationAt: null,
        setupPullRequest: null,
      }],
    });

    const preview = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-preview`,
    );
    responses.push(preview.body);
    expect(preview.status).toBe(200);
    const workflow = buildLimenWorkflow({
      actionSha: ACTION_SHA,
      limenApiUrl: "https://api.example.test",
    });
    expect(preview.body).toEqual({
      repositoryId: REPOSITORY_ID,
      files: [
        { path: "limen.yml", status: "missing", content: DEFAULT_LIMEN_POLICY },
        { path: ".github/workflows/limen.yml", status: "missing", content: workflow },
      ],
      filesToCreate: ["limen.yml", ".github/workflows/limen.yml"],
      alreadyConfigured: false,
    });
    expect(workflow).toContain(`uses: kaelah971/limen@${ACTION_SHA}`);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}");
    expect(workflow).toContain("${{ vars.TELEGRAPH_ENGINE_URL }}");
    expect(workflow).toContain("limen-api-url: https://api.example.test");
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("actions: write");
    expect(workflow).not.toContain("LIMEN_API_KEY");
    expect(workflow).not.toContain("13.237.89.59");
    expect(workflow).not.toContain(GITHUB_APP_PRIVATE_KEY);
    expect(workflow).not.toContain(TELEGRAPH_PRIVATE_KEY);

    const setup = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-pr`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(setup.body);
    expect(setup.status).toBe(200);
    expect(setup.body).toMatchObject({
      repositoryId: REPOSITORY_ID,
      code: "SETUP_PR_CREATED",
      setupPullRequest: {
        number: 42,
        url: "https://github.com/kaelah971/limen-demo/pull/42",
        state: "OPEN",
      },
    });
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("SETUP_PR_OPEN");
    expect(fixture.store.setupTransitionCount).toBe(1);
    expect(fixture.transport.createdFiles.map((file) => file.path)).toEqual([
      "limen.yml",
      ".github/workflows/limen.yml",
    ]);
    expect(fixture.transport.createdFiles.map((file) => file.content)).toEqual([
      DEFAULT_LIMEN_POLICY,
      workflow,
    ]);
    expect(fixture.transport.pullRequests[0]).toMatchObject({
      title: "Configure Limen release evidence gate",
      head: "limen/setup-301-1700000000",
      base: "main",
    });
    expect(fixture.transport.pullRequests[0]?.body).toContain(
      "Add `LIMEN_TELEGRAPH_PRIVATE_KEY` to the GitHub repository Secrets",
    );
    expect(fixture.transport.pullRequests[0]?.body).toContain(
      "Add `TELEGRAPH_ENGINE_URL` to the GitHub repository Variables",
    );
    expect(fixture.transport.pullRequests[0]?.body).not.toContain(TELEGRAPH_PRIVATE_KEY);

    const setupCallsAfterCreate = fixture.transport.calls.length;
    const duplicateSetup = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-pr`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(duplicateSetup.body);
    expect(duplicateSetup.status).toBe(200);
    expect(duplicateSetup.body).toMatchObject({ code: "OPEN_SETUP_PR_EXISTS" });
    expect(fixture.transport.calls).toHaveLength(setupCallsAfterCreate);
    expect(fixture.store.setupTransitionCount).toBe(1);

    const mergedSetup = await postWebhook(
      fixture,
      "setup-pr-merged-42",
      "pull_request",
      setupPullRequestClosedPayload(42),
    );
    responses.push(mergedSetup.body);
    expect(mergedSetup.status).toBe(200);
    expect(fixture.store.setupPullRequests.get(`${REPOSITORY_ID}:42`)).toMatchObject({ state: "MERGED" });
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("CONFIGURED");

    const passToken = registerOidc(fixture, 401, 1);
    const pass = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      passToken,
      "POST",
      evaluationBody(401, 1, "PASS", EVALUATION_TIMES.pass),
    );
    responses.push(pass.body);
    expect(pass.status).toBe(200);
    expect(pass.body).toMatchObject({ accepted: true, evaluation: { decision: "PASS" } });
    expect(fixture.store.evaluations).toHaveLength(1);
    expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
      lifecycleState: "VERIFIED",
      latestDecision: "PASS",
      latestEvaluationAt: EVALUATION_TIMES.pass,
    });

    const detail = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}`,
    );
    responses.push(detail.body);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      lifecycleState: "VERIFIED",
      latestDecision: "PASS",
      latestEvaluationAt: EVALUATION_TIMES.pass,
      setupPullRequest: {
        number: 42,
        url: "https://github.com/kaelah971/limen-demo/pull/42",
      },
    });

    for (const [runId, decision, evaluatedAt] of [
      [402, "HOLD", EVALUATION_TIMES.hold],
      [403, "REVIEW", EVALUATION_TIMES.review],
    ] as const) {
      const token = registerOidc(fixture, runId, 1);
      const result = await apiRequest(
        fixture,
        "/v1/github/evaluations",
        token,
        "POST",
        evaluationBody(runId, 1, decision, evaluatedAt),
      );
      responses.push(result.body);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ accepted: true, evaluation: { decision } });
      expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
        lifecycleState: "VERIFIED",
        latestDecision: decision,
        latestEvaluationAt: evaluatedAt,
      });
      expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).not.toBe(decision);
    }

    const healthToken = registerOidc(fixture, 500, 1);
    const health = await apiRequest(
      fixture,
      "/v1/github/integration-health",
      healthToken,
      "POST",
      healthBody(500, 1, "2026-09-06T03:30:00.000Z"),
    );
    responses.push(health.body);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      accepted: true,
      lifecycleState: "NEEDS_ATTENTION",
    });
    expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
      lifecycleState: "NEEDS_ATTENTION",
      latestDecision: "REVIEW",
      latestEvaluationAt: EVALUATION_TIMES.review,
    });
    expect(fixture.store.evaluations).toHaveLength(3);
    expect(fixture.store.recordedHealthInputs).toHaveLength(1);

    const duplicateHealth = await apiRequest(
      fixture,
      "/v1/github/integration-health",
      healthToken,
      "POST",
      healthBody(500, 1, "2026-09-06T03:30:00.000Z"),
    );
    responses.push(duplicateHealth.body);
    expect(duplicateHealth.status).toBe(200);
    expect(fixture.store.recordedHealthInputs).toHaveLength(1);
    expect(fixture.store.healthTransitionCount).toBe(1);

    const recoveryToken = registerOidc(fixture, 501, 1);
    const recovery = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      recoveryToken,
      "POST",
      evaluationBody(501, 1, "PASS", EVALUATION_TIMES.recovery),
    );
    responses.push(recovery.body);
    expect(recovery.status).toBe(200);
    expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
      lifecycleState: "VERIFIED",
      latestDecision: "PASS",
      latestEvaluationAt: EVALUATION_TIMES.recovery,
    });

    const duplicateEvaluation = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      recoveryToken,
      "POST",
      evaluationBody(501, 1, "PASS", EVALUATION_TIMES.recovery),
    );
    responses.push(duplicateEvaluation.body);
    expect(duplicateEvaluation.status).toBe(200);
    expect(fixture.store.evaluations).toHaveLength(4);
    expect(fixture.store.recordedEvaluationInputs).toHaveLength(4);

    const removed = await postWebhook(
      fixture,
      "repository-removed-301",
      "installation_repositories",
      installationRepositoriesPayload("removed"),
    );
    responses.push(removed.body);
    expect(removed.status).toBe(200);
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");

    const readded = await postWebhook(
      fixture,
      "repository-readded-301",
      "installation_repositories",
      installationRepositoriesPayload("added"),
    );
    responses.push(readded.body);
    expect(readded.status).toBe(200);
    expect(fixture.store.installations.get(INSTALLATION_ID)?.connectionState).toBe("ACTIVE");
    expect(fixture.store.repositories.get(REPOSITORY_ID)).toMatchObject({
      lifecycleState: "SETUP_REQUIRED",
      latestDecision: "PASS",
      latestEvaluationAt: EVALUATION_TIMES.recovery,
    });
    expect(fixture.store.historicalEvaluations.get(REPOSITORY_ID)).toHaveLength(4);

    const readdedSetup = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-pr`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(readdedSetup.body);
    expect(readdedSetup.status).toBe(200);
    expect(readdedSetup.body).toMatchObject({
      code: "SETUP_PR_CREATED",
      setupPullRequest: { number: 43 },
    });
    const readdedMerged = await postWebhook(
      fixture,
      "setup-pr-merged-43",
      "pull_request",
      setupPullRequestClosedPayload(43),
    );
    responses.push(readdedMerged.body);
    expect(readdedMerged.status).toBe(200);
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("CONFIGURED");

    const finalEvaluationToken = registerOidc(fixture, 502, 1);
    const finalEvaluation = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      finalEvaluationToken,
      "POST",
      evaluationBody(502, 1, "PASS", EVALUATION_TIMES.readded),
    );
    responses.push(finalEvaluation.body);
    expect(finalEvaluation.status).toBe(200);
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("VERIFIED");

    const userBBind = await apiRequest(
      fixture,
      `/v1/github/installations/${INSTALLATION_ID}/bind`,
      OTHER_ACCESS_TOKEN,
      "POST",
    );
    responses.push(userBBind.body);
    expect(userBBind.status).toBe(403);

    const userBRepositories = await apiRequest(
      fixture,
      "/v1/github/repositories",
      OTHER_ACCESS_TOKEN,
    );
    responses.push(userBRepositories.body);
    expect(userBRepositories.status).toBe(200);
    expect(userBRepositories.body).toEqual({ repositories: [] });
    for (const path of [
      `/v1/github/repositories/${REPOSITORY_ID}`,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-preview`,
      `/v1/github/repositories/${REPOSITORY_ID}/evaluations`,
    ]) {
      const response = await apiRequest(fixture, path, OTHER_ACCESS_TOKEN);
      responses.push(response.body);
      expect(response.status).toBe(404);
    }
    const userBSetup = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-pr`,
      OTHER_ACCESS_TOKEN,
      "POST",
    );
    responses.push(userBSetup.body);
    expect(userBSetup.status).toBe(404);

    const mismatchRunId = 601;
    const mismatchToken = registerOidc(fixture, mismatchRunId, 1);
    const repositoryMismatch = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      mismatchToken,
      "POST",
      { ...evaluationBody(mismatchRunId, 1, "PASS", "2026-09-06T06:00:00.000Z"), repositoryId: 302 },
    );
    responses.push(repositoryMismatch.body);
    expect(repositoryMismatch.status).toBe(403);
    expect(fixture.store.evaluations.has(`302:${mismatchRunId}:1`)).toBe(false);

    const workflowMismatchRunId = 602;
    const workflowMismatch = "kaelah971/limen-demo/.github/workflows/not-limen.yml@refs/heads/main";
    const workflowMismatchToken = registerOidc(fixture, workflowMismatchRunId, 1);
    const workflowMismatchResponse = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      workflowMismatchToken,
      "POST",
      evaluationBody(workflowMismatchRunId, 1, "PASS", "2026-09-06T06:01:00.000Z", workflowMismatch),
    );
    responses.push(workflowMismatchResponse.body);
    expect(workflowMismatchResponse.status).toBe(403);
    expect(fixture.store.evaluations.has(`${REPOSITORY_ID}:${workflowMismatchRunId}:1`)).toBe(false);

    const deleted = await postWebhook(
      fixture,
      "installation-deleted-201",
      "installation",
      installationDeletedPayload(),
    );
    responses.push(deleted.body);
    expect(deleted.status).toBe(200);
    expect(fixture.store.installations.get(INSTALLATION_ID)?.connectionState).toBe("DISCONNECTED");
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");

    const stalePreview = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-preview`,
    );
    responses.push(stalePreview.body);
    expect(stalePreview.status).toBe(409);
    const staleSetup = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/setup-pr`,
      ACCESS_TOKEN,
      "POST",
    );
    responses.push(staleSetup.body);
    expect(staleSetup.status).toBe(409);
    const staleEvaluationToken = registerOidc(fixture, 603, 1);
    const staleEvaluation = await apiRequest(
      fixture,
      "/v1/github/evaluations",
      staleEvaluationToken,
      "POST",
      evaluationBody(603, 1, "PASS", "2026-09-06T06:02:00.000Z"),
    );
    responses.push(staleEvaluation.body);
    expect(staleEvaluation.status).toBe(409);
    const staleHealthToken = registerOidc(fixture, 604, 1);
    const staleHealth = await apiRequest(
      fixture,
      "/v1/github/integration-health",
      staleHealthToken,
      "POST",
      healthBody(604, 1, "2026-09-06T06:03:00.000Z"),
    );
    responses.push(staleHealth.body);
    expect(staleHealth.status).toBe(409);
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");
    expect(fixture.store.evaluations).toHaveLength(5);
    expect(fixture.store.recordedHealthInputs).toHaveLength(1);

    const history = await apiRequest(
      fixture,
      `/v1/github/repositories/${REPOSITORY_ID}/evaluations`,
    );
    responses.push(history.body);
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({
      repositoryId: REPOSITORY_ID,
      evaluations: [
        { githubRunId: 502, decision: "PASS" },
        { githubRunId: 501, decision: "PASS" },
        { githubRunId: 403, decision: "REVIEW" },
        { githubRunId: 402, decision: "HOLD" },
        { githubRunId: 401, decision: "PASS" },
      ],
    });
    expect(fixture.store.historicalEvaluations.get(REPOSITORY_ID)).toHaveLength(5);
    expect(fixture.store.repositories.get(REPOSITORY_ID)?.lifecycleState).toBe("DISCONNECTED");

    assertNoFixtureSecret(responses);
    assertNoFixtureSecret(fixture.store.repositories);
    assertNoFixtureSecret(fixture.store.installations);
    assertNoFixtureSecret(fixture.store.historicalEvaluations);
    assertNoFixtureSecret(fixture.transport.createdFiles);
    assertNoFixtureSecret(fixture.logs);
    expect(JSON.stringify(workflow)).not.toContain(TELEGRAPH_PRIVATE_KEY);
    expect(JSON.stringify(workflow)).not.toContain(GITHUB_APP_PRIVATE_KEY);
    expect(fixture.transport.calls.every((call) => call.token === INSTALLATION_TOKEN)).toBe(true);
  });
});
