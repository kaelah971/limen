import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGitHubActionsOidcToken } from "../packages/github-app/src";
import { createLedgerServer } from "../apps/api/src/server";
import { SupabaseGitHubAppStore } from "../apps/api/src/github-app-store";

const EVALUATIONS_SCHEMA_PATH =
  "supabase/migrations/20260905000000_create_github_app_onboarding.sql";
const EVALUATION_MIGRATION_PATH =
  "supabase/migrations/20260906010000_add_atomic_github_evaluation_persistence.sql";

describe("atomic evaluation persistence migration", () => {
  it("defines a service-role-only atomic evaluation persistence RPC", async () => {
    const [schema, migration] = await Promise.all([
      readFile(EVALUATIONS_SCHEMA_PATH, "utf8"),
      readFile(EVALUATION_MIGRATION_PATH, "utf8"),
    ]);
    const normalized = migration.toLowerCase();
    const functionStart = normalized.indexOf(
      "create or replace function public.record_github_evaluation_and_verify",
    );
    const revokeStart = normalized.indexOf(
      "revoke execute on function public.record_github_evaluation_and_verify",
    );
    const functionBody = normalized.slice(functionStart, revokeStart);

    expect(schema).toContain("unique (repository_id, github_run_id, run_attempt)");
    expect(normalized).toMatch(
      /create or replace function public\.record_github_evaluation_and_verify\s*\(\s*p_repository_id\s+bigint\s*,\s*p_github_run_id\s+bigint\s*,\s*p_run_attempt\s+integer\s*,\s*p_workflow_ref\s+text\s*,\s*p_commit_sha\s+text\s*,\s*p_decision\s+text\s*,\s*p_receipt_id\s+text\s*,\s*p_evaluated_at\s+timestamptz\s*\)/i,
    );
    expect(normalized).toContain("returns public.repository_evaluations");
    expect(functionBody).toContain("security definer");
    expect(functionBody).toMatch(/set search_path\s*=\s*pg_catalog\s*,\s*public/);
    expect(functionBody).toMatch(/p_repository_id\s+is null|p_repository_id\s*<=\s*0/);
    expect(functionBody).toMatch(/p_github_run_id\s+is null|p_github_run_id\s*<=\s*0/);
    expect(functionBody).toMatch(/p_run_attempt\s+is null|p_run_attempt\s*<=\s*0/);
    expect(functionBody).toContain("github_evaluation_input_invalid");
    expect(functionBody).toContain("p_decision not in ('pass', 'hold', 'review')");
    expect(functionBody).toMatch(/length\((?:btrim\(p_workflow_ref\)|normalized_workflow_ref)\)\s*=\s*0/);
    expect(functionBody).toMatch(/length\((?:btrim\(p_commit_sha\)|normalized_commit_sha)\)\s*=\s*0/);
    expect(functionBody).toContain("p_evaluated_at is null");
    expect(functionBody).toMatch(/from\s+public\.github_repositories/);
    expect(functionBody).toMatch(/for update/);
    expect(functionBody).toMatch(/from\s+public\.github_installations/);
    expect(functionBody).toContain("connection_state = 'active'");
    expect(functionBody).toContain("github_repository_disconnected");
    expect(functionBody).toMatch(
      /from\s+public\.repository_evaluations[\s\S]*github_run_id[\s\S]*run_attempt[\s\S]*for update/,
    );
    expect(functionBody).toContain("github_evaluation_conflict");
    expect(functionBody).toContain("return existing_evaluation");
    expect(functionBody).toContain("existing_evaluation.workflow_ref");
    expect(functionBody).toContain("existing_evaluation.commit_sha");
    expect(functionBody).toContain("existing_evaluation.decision");
    expect(functionBody).toContain("existing_evaluation.receipt_id");
    expect(functionBody).toContain("existing_evaluation.evaluated_at");
    expect(functionBody).toMatch(
      /insert\s+into\s+public\.repository_evaluations[\s\S]*returning\s+\*/,
    );
    expect(functionBody).toMatch(/update\s+public\.github_repositories/);
    expect(functionBody).toContain("latest_decision");
    expect(functionBody).toContain("latest_evaluation_at");
    expect(functionBody).toContain("lifecycle_state in ('configured', 'needs_attention')");
    expect(functionBody).toContain("else lifecycle_state");
    expect(functionBody).toContain("'verified'");
    expect(functionBody).not.toMatch(/update\s+public\.repository_evaluations/);
    expect(functionBody.indexOf("github_evaluation_conflict")).toBeLessThan(
      functionBody.indexOf("update public.github_repositories"),
    );

    expect(normalized).toMatch(
      /revoke execute on function public\.record_github_evaluation_and_verify\s*\(bigint, bigint, integer, text, text, text, text, timestamptz\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(normalized).toMatch(
      /grant execute on function public\.record_github_evaluation_and_verify\s*\(bigint, bigint, integer, text, text, text, text, timestamptz\)\s+to\s+service_role/i,
    );
    expect(normalized).not.toMatch(
      /(oidc|private_key|installation_token|telegraph_private_key|access_token|refresh_token|oauth_token)/i,
    );
  });
});

const OIDC_TOKEN = "opaque-github-oidc-token";
const OIDC_AUDIENCE = "limen-api";
const REPOSITORY_ID = 123456;
const RUN_ID = 33959096100;
const RUN_ATTEMPT = 1;
const WORKFLOW_REF =
  "kaelah971/limen-demo/.github/workflows/limen.yml@refs/heads/main";
const COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const OIDC_CLAIMS = {
  iss: "https://token.actions.githubusercontent.com",
  aud: OIDC_AUDIENCE,
  repository: "kaelah971/limen-demo",
  repository_id: String(REPOSITORY_ID),
  run_id: String(RUN_ID),
  run_attempt: String(RUN_ATTEMPT),
  workflow_ref: WORKFLOW_REF,
  sha: COMMIT_SHA,
  sub: "repo:kaelah971/limen-demo:ref:refs/heads/main",
} as const;

const EVALUATION_BODY = {
  repositoryId: REPOSITORY_ID,
  githubRunId: RUN_ID,
  githubRunAttempt: RUN_ATTEMPT,
  workflowRef: WORKFLOW_REF,
  commitSha: COMMIT_SHA,
  decision: "REVIEW" as const,
  receiptId: null,
  evaluatedAt: "2026-09-06T00:00:00.000Z",
};

const HEALTH_BODY = {
  repositoryId: REPOSITORY_ID,
  githubRunId: RUN_ID,
  githubRunAttempt: RUN_ATTEMPT,
  workflowRef: WORKFLOW_REF,
  code: "CONFIGURATION_INVALID" as const,
  observedAt: "2026-09-06T00:00:00.000Z",
};

const EVALUATION_REPOSITORY = {
  repositoryId: REPOSITORY_ID,
  fullName: "kaelah971/limen-demo",
  installationConnectionState: "ACTIVE" as const,
  lifecycleState: "CONFIGURED" as const,
};

type FakeEvaluationRepository = {
  repositoryId: number;
  fullName: string;
  installationConnectionState: "ACTIVE" | "DISCONNECTED";
  lifecycleState:
    | "SETUP_REQUIRED"
    | "SETUP_PR_OPEN"
    | "CONFIGURED"
    | "VERIFIED"
    | "NEEDS_ATTENTION"
    | "DISCONNECTED";
};

function verifierFor(claims: Record<string, unknown> = OIDC_CLAIMS) {
  return vi.fn(async () => ({ payload: claims }));
}

async function verifyClaims(
  claims: Record<string, unknown> = OIDC_CLAIMS,
  token = OIDC_TOKEN,
) {
  return verifyGitHubActionsOidcToken(token, OIDC_AUDIENCE, verifierFor(claims));
}

class FakeEvaluationStore {
  repository: FakeEvaluationRepository | null = { ...EVALUATION_REPOSITORY };
  readonly recordedInputs: Record<string, unknown>[] = [];
  readonly evaluations: Record<string, unknown>[] = [];
  readonly healthInputs: Record<string, unknown>[] = [];
  recordError: Error | undefined;
  healthError: Error | undefined;

  async getEvaluationRepository(repositoryId: number) {
    return this.repository?.repositoryId === repositoryId ? this.repository : null;
  }

  async recordGitHubEvaluation(input: Record<string, unknown>) {
    this.recordedInputs.push(input);
    if (this.recordError !== undefined) {
      throw this.recordError;
    }
    const evaluation = { id: "evaluation-1", ...input };
    this.evaluations.push(evaluation);
    return evaluation;
  }

  async markRepositoryNeedsAttention(input: Record<string, unknown>) {
    if (this.healthError !== undefined) {
      throw this.healthError;
    }
    this.healthInputs.push(input);
    if (this.repository !== null) {
      this.repository.lifecycleState = "NEEDS_ATTENTION";
    }
  }
}

const evaluationServers: ReturnType<typeof createLedgerServer>[] = [];

afterEach(async () => {
  await Promise.all(evaluationServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startEvaluationServer(
  store: FakeEvaluationStore,
  verifier = verifierFor(),
): Promise<string> {
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-OIDC-TEST", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ingest-secret",
    githubEvaluationApi: {
      store,
      oidcAudience: OIDC_AUDIENCE,
      oidcVerifier: verifier,
    },
  } as never);
  evaluationServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

async function postEvaluation(
  url: string,
  body: unknown = EVALUATION_BODY,
  token: string | null = OIDC_TOKEN,
): Promise<Response> {
  return fetch(`${url}/v1/github/evaluations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

async function startHealthServer(
  store: FakeEvaluationStore,
  verifier = verifierFor(),
): Promise<string> {
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-OIDC-HEALTH-TEST", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ingest-secret",
    githubIntegrationHealthApi: {
      store,
      oidcAudience: OIDC_AUDIENCE,
      oidcVerifier: verifier,
    },
  } as never);
  evaluationServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

async function postHealth(
  url: string,
  body: unknown = HEALTH_BODY,
  token: string | null = OIDC_TOKEN,
): Promise<Response> {
  return fetch(`${url}/v1/github/integration-health`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

describe("GitHub Actions OIDC claim validation", () => {
  it("accepts explicit immutable repository and run claims without using sub", async () => {
    await expect(verifyClaims()).resolves.toEqual({
      repository: OIDC_CLAIMS.repository,
      repositoryId: REPOSITORY_ID,
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      workflowRef: WORKFLOW_REF,
    });
  });

  it.each([
    ["wrong issuer", { iss: "https://evil.example" }],
    ["wrong audience", { aud: "other-audience" }],
    ["missing repository", { repository: undefined }],
    ["missing repository_id", { repository_id: undefined }],
    ["non-positive repository_id", { repository_id: "0" }],
    ["unsafe repository_id", { repository_id: String(Number.MAX_SAFE_INTEGER + 1) }],
    ["missing run_id", { run_id: undefined }],
    ["non-positive run_id", { run_id: "0" }],
    ["unsafe run_id", { run_id: String(Number.MAX_SAFE_INTEGER + 1) }],
    ["missing run_attempt", { run_attempt: undefined }],
    ["invalid run_attempt", { run_attempt: "not-an-integer" }],
    ["non-positive run_attempt", { run_attempt: "0" }],
    ["missing workflow_ref", { workflow_ref: undefined }],
    ["malformed workflow_ref", { workflow_ref: "kaelah971/limen-demo/.github/workflows/other.yml@main" }],
    ["workflow repository mismatch", { workflow_ref: "other/repository/.github/workflows/limen.yml@main" }],
    ["workflow path traversal", { workflow_ref: "kaelah971/limen-demo/../.github/workflows/limen.yml@main" }],
    ["control character in repository", { repository: "kaelah971/limen-demo\nattacker" }],
  ] as const)("rejects %s", async (_label, override) => {
    const claims = { ...OIDC_CLAIMS, ...override };
    await expect(verifyClaims(claims)).rejects.toMatchObject({ code: "GITHUB_OIDC_REJECTED" });
  });

  it("rejects malformed or expired JWT verification", async () => {
    const verifier = vi.fn(async () => {
      throw new Error("expired JWT");
    });

    await expect(verifyGitHubActionsOidcToken(OIDC_TOKEN, OIDC_AUDIENCE, verifier))
      .rejects.toMatchObject({ code: "GITHUB_OIDC_REJECTED" });
  });

  it("rejects an oversized bearer token before verification", async () => {
    const verifier = verifierFor();
    const oversizedToken = "x".repeat(16 * 1024 + 1);

    await expect(verifyGitHubActionsOidcToken(oversizedToken, OIDC_AUDIENCE, verifier))
      .rejects.toMatchObject({ code: "GITHUB_OIDC_TOKEN_TOO_LARGE" });
    expect(verifier).not.toHaveBeenCalled();
  });

  it("passes the fixed issuer, audience, and RS256 requirements to the verifier", async () => {
    const verifier = verifierFor();

    await verifyGitHubActionsOidcToken(OIDC_TOKEN, OIDC_AUDIENCE, verifier);

    expect(verifier).toHaveBeenCalledWith(OIDC_TOKEN, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: OIDC_AUDIENCE,
      algorithms: ["RS256"],
    });
  });
});

describe("GitHub Actions evaluation endpoint", () => {
  it("persists through the exact atomic evaluation RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: "evaluation-1",
        repository_id: REPOSITORY_ID,
        github_run_id: RUN_ID,
        run_attempt: RUN_ATTEMPT,
        workflow_ref: WORKFLOW_REF,
        commit_sha: COMMIT_SHA,
        decision: "REVIEW",
        receipt_id: null,
        evaluated_at: EVALUATION_BODY.evaluatedAt,
      },
      error: null,
    }));
    const store = new SupabaseGitHubAppStore({ rpc } as never);

    await expect(store.recordGitHubEvaluation(EVALUATION_BODY)).resolves.toMatchObject({
      id: "evaluation-1",
      repositoryId: REPOSITORY_ID,
      githubRunId: RUN_ID,
      githubRunAttempt: RUN_ATTEMPT,
    });
    expect(rpc).toHaveBeenCalledWith("record_github_evaluation_and_verify", {
      p_repository_id: REPOSITORY_ID,
      p_github_run_id: RUN_ID,
      p_run_attempt: RUN_ATTEMPT,
      p_workflow_ref: WORKFLOW_REF,
      p_commit_sha: COMMIT_SHA,
      p_decision: "REVIEW",
      p_receipt_id: null,
      p_evaluated_at: EVALUATION_BODY.evaluatedAt,
    });
  });

  it("accepts a verified evaluation and records only sanitized data", async () => {
    const store = new FakeEvaluationStore();
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ accepted: true });
    expect(store.recordedInputs).toEqual([EVALUATION_BODY]);
    expect(JSON.stringify(body)).not.toContain(OIDC_TOKEN);
  });

  it.each([
    ["missing authorization", null],
    ["malformed authorization", "Basic credentials"],
  ] as const)("rejects %s before persistence", async (_label, token) => {
    const store = new FakeEvaluationStore();
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url, EVALUATION_BODY, token);

    expect(response.status).toBe(401);
    expect(store.recordedInputs).toHaveLength(0);
  });

  it.each([
    ["repository ID", { repositoryId: REPOSITORY_ID + 1 }],
    ["run ID", { githubRunId: RUN_ID + 1 }],
    ["run attempt", { githubRunAttempt: RUN_ATTEMPT + 1 }],
    ["workflow ref", { workflowRef: `${WORKFLOW_REF}-mismatch` }],
  ] as const)("rejects JWT/body %s mismatch", async (_label, override) => {
    const store = new FakeEvaluationStore();
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url, { ...EVALUATION_BODY, ...override });

    expect(response.status).toBe(403);
    expect(store.recordedInputs).toHaveLength(0);
  });

  it("rejects a JWT repository that does not match the stored repository", async () => {
    const store = new FakeEvaluationStore();
    store.repository = {
      ...EVALUATION_REPOSITORY,
      fullName: "other-owner/other-repository",
    };
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url);

    expect(response.status).toBe(403);
    expect(store.recordedInputs).toHaveLength(0);
  });

  it.each([
    ["unknown repository", null, 404, undefined],
    ["disconnected installation", {
      ...EVALUATION_REPOSITORY,
      installationConnectionState: "DISCONNECTED" as const,
    }, 409, "GITHUB_INSTALLATION_DISCONNECTED"],
    ["disconnected repository", {
      ...EVALUATION_REPOSITORY,
      lifecycleState: "DISCONNECTED" as const,
    }, 409, "GITHUB_REPOSITORY_DISCONNECTED"],
    ["setup required repository", {
      ...EVALUATION_REPOSITORY,
      lifecycleState: "SETUP_REQUIRED" as const,
    }, 409, "GITHUB_REPOSITORY_NOT_READY"],
    ["setup PR open repository", {
      ...EVALUATION_REPOSITORY,
      lifecycleState: "SETUP_PR_OPEN" as const,
    }, 409, "GITHUB_REPOSITORY_NOT_READY"],
  ] as const)("rejects %s", async (_label, repository, status, code) => {
    const store = new FakeEvaluationStore();
    store.repository = repository;
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url);
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(status);
    if (code !== undefined) {
      expect(body.code).toBe(code);
    }
    expect(store.recordedInputs).toHaveLength(0);
  });

  it("rejects invalid body values and sensitive extra fields", async () => {
    const store = new FakeEvaluationStore();
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url, {
      ...EVALUATION_BODY,
      commitSha: "not-a-sha",
      githubToken: "github-token-fixture",
    });
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(body).not.toContain("github-token-fixture");
    expect(store.recordedInputs).toHaveLength(0);
  });

  it("rejects an invalid evaluatedAt timestamp", async () => {
    const store = new FakeEvaluationStore();
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url, {
      ...EVALUATION_BODY,
      evaluatedAt: "not-a-date",
    });

    expect(response.status).toBe(400);
    expect(store.recordedInputs).toHaveLength(0);
  });

  it("maps a conflicting duplicate without changing persistence state", async () => {
    const store = new FakeEvaluationStore();
    store.recordError = Object.assign(new Error("database details"), {
      code: "GITHUB_EVALUATION_CONFLICT",
    });
    const url = await startEvaluationServer(store);

    const response = await postEvaluation(url);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(409);
    expect(body).toContain("GITHUB_EVALUATION_CONFLICT");
    expect(body).not.toContain("database details");
    expect(store.evaluations).toHaveLength(0);
  });

  it("does not expose JWT or provider fixture values in errors", async () => {
    const store = new FakeEvaluationStore();
    const verifier = vi.fn(async () => {
      throw new Error("provider-token-fixture private-key-fixture");
    });
    const url = await startEvaluationServer(store, verifier);

    const response = await postEvaluation(url, EVALUATION_BODY, OIDC_TOKEN);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(body).not.toContain(OIDC_TOKEN);
    expect(body).not.toContain("provider-token-fixture");
    expect(body).not.toContain("private-key-fixture");
  });
});

describe("GitHub Actions integration health endpoint", () => {
  it.each(["CONFIGURED", "VERIFIED"] as const)("accepts CONFIGURATION_INVALID from %s and transitions the repository without recording an evaluation", async (lifecycleState) => {
    const store = new FakeEvaluationStore();
    store.repository = { ...EVALUATION_REPOSITORY, lifecycleState };
    const url = await startHealthServer(store);

    const response = await postHealth(url);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ accepted: true, repositoryId: REPOSITORY_ID, lifecycleState: "NEEDS_ATTENTION" });
    expect(store.healthInputs).toEqual([{ repositoryId: REPOSITORY_ID, observedAt: HEALTH_BODY.observedAt }]);
    expect(store.recordedInputs).toHaveLength(0);
    expect(JSON.stringify(body)).not.toMatch(/PASS|HOLD|REVIEW/);
  });

  it("is idempotent for a repository already needing attention", async () => {
    const store = new FakeEvaluationStore();
    store.repository = { ...EVALUATION_REPOSITORY, lifecycleState: "NEEDS_ATTENTION" };
    const url = await startHealthServer(store);

    const first = await postHealth(url);
    const second = await postHealth(url);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(store.repository?.lifecycleState).toBe("NEEDS_ATTENTION");
    expect(store.recordedInputs).toHaveLength(0);
  });

  it.each([
    ["missing authorization", null, 401],
    ["malformed authorization", "Basic credentials", 401],
  ] as const)("rejects %s before persistence", async (_label, token, status) => {
    const store = new FakeEvaluationStore();
    const url = await startHealthServer(store);

    const response = await postHealth(url, HEALTH_BODY, token);

    expect(response.status).toBe(status);
    expect(store.healthInputs).toHaveLength(0);
  });

  it.each([
    ["repository ID", { repositoryId: REPOSITORY_ID + 1 }],
    ["run ID", { githubRunId: RUN_ID + 1 }],
    ["run attempt", { githubRunAttempt: RUN_ATTEMPT + 1 }],
    ["workflow ref", { workflowRef: `${WORKFLOW_REF}-mismatch` }],
  ] as const)("rejects JWT/body %s mismatch", async (_label, override) => {
    const store = new FakeEvaluationStore();
    const url = await startHealthServer(store);

    const response = await postHealth(url, { ...HEALTH_BODY, ...override });

    expect(response.status).toBe(403);
    expect(store.healthInputs).toHaveLength(0);
  });

  it("rejects a JWT repository that does not match the stored repository", async () => {
    const store = new FakeEvaluationStore();
    store.repository = { ...EVALUATION_REPOSITORY, fullName: "other-owner/other-repository" };
    const url = await startHealthServer(store);

    const response = await postHealth(url);

    expect(response.status).toBe(403);
    expect(store.healthInputs).toHaveLength(0);
  });

  it.each([
    ["unknown repository", null, 404, undefined],
    ["disconnected installation", { ...EVALUATION_REPOSITORY, installationConnectionState: "DISCONNECTED" as const }, 409, "GITHUB_INSTALLATION_DISCONNECTED"],
    ["disconnected repository", { ...EVALUATION_REPOSITORY, lifecycleState: "DISCONNECTED" as const }, 409, "GITHUB_REPOSITORY_DISCONNECTED"],
    ["setup required repository", { ...EVALUATION_REPOSITORY, lifecycleState: "SETUP_REQUIRED" as const }, 409, "GITHUB_REPOSITORY_NOT_READY"],
    ["setup PR open repository", { ...EVALUATION_REPOSITORY, lifecycleState: "SETUP_PR_OPEN" as const }, 409, "GITHUB_REPOSITORY_NOT_READY"],
  ] as const)("rejects %s", async (_label, repository, status, code) => {
    const store = new FakeEvaluationStore();
    store.repository = repository;
    const url = await startHealthServer(store);

    const response = await postHealth(url);
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(status);
    if (code !== undefined) {
      expect(body.code).toBe(code);
    }
    expect(store.healthInputs).toHaveLength(0);
  });

  it("accepts only the exact health body and code", async () => {
    const store = new FakeEvaluationStore();
    const url = await startHealthServer(store);

    const response = await postHealth(url, { ...HEALTH_BODY, decision: "REVIEW", unexpected: "secret" });
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(body).not.toContain("secret");
    expect(store.healthInputs).toHaveLength(0);
  });

  it("does not expose OIDC or provider fixture values in health errors", async () => {
    const store = new FakeEvaluationStore();
    const verifier = vi.fn(async () => {
      throw new Error("provider-token-fixture private-key-fixture");
    });
    const url = await startHealthServer(store, verifier);

    const response = await postHealth(url);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(body).not.toContain(OIDC_TOKEN);
    expect(body).not.toContain("provider-token-fixture");
    expect(body).not.toContain("private-key-fixture");
  });

  it("maps an unexpected store failure to a sanitized 500", async () => {
    const store = new FakeEvaluationStore();
    store.healthError = new Error("supabase-service-role-key provider-payload");
    const url = await startHealthServer(store);

    const response = await postHealth(url);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("GITHUB_INTEGRATION_HEALTH_INTERNAL_ERROR");
    expect(body).not.toContain("supabase-service-role-key");
    expect(body).not.toContain("provider-payload");
  });
});
