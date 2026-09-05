import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLedgerServer,
  loadLedgerApiConfig,
  LedgerConflictError,
  LedgerPersistenceError,
  SupabaseEvidenceLedger,
} from "../apps/api/src";
import { buildLedgerRunIngest } from "../action/src/ledger";
import { persistActionLedger } from "../action/src/persist";
import type { ActionPullRequestContext, LimenRunResult } from "../action/src/types";
import {
  validateLedgerRunIngest,
  LedgerIngestClient,
  LedgerClientError,
  backfillSanitizedRun,
  type EvidenceLedger,
  type LedgerRunIngest,
  type PersistedRunDetail,
} from "../packages/ledger/src";
import type {
  LimenDecisionResult,
  RepositoryExposureEvidence,
  TelegraphCveEvidence,
} from "../packages/core/src";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const POLICY_VERSION = "LP-test";
const RUN_ID = 33655468552;

const context: ActionPullRequestContext = {
  owner: "acme",
  repo: "service",
  repository: "acme/service",
  pullRequestNumber: 42,
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
  actor: "octocat",
  eventName: "pull_request",
  authorAssociation: "MEMBER",
  githubRunId: RUN_ID,
  githubRunAttempt: 1,
};

const repositoryEvidence: RepositoryExposureEvidence = {
  repository: context.repository,
  commitSha: HEAD_SHA,
  pullRequestNumber: context.pullRequestNumber,
  packageName: "lodash",
  ecosystem: "npm",
  installedVersion: "4.17.20",
  vulnerableRange: "<4.17.21",
  firstPatchedVersion: "4.17.21",
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  manifestPath: "package-lock.json",
  scope: "runtime",
  relationship: "direct",
  exposureState: "affected",
  source: "github-dependency-review+global-advisory",
};

const telegraphEvidence: TelegraphCveEvidence = {
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  description: "A sanitized routed result.",
  references: [],
  affectedVersions: ["<4.17.21"],
  fixedVersions: ["4.17.21"],
  fixAvailable: true,
  intent: "CVE_LOOKUP",
  minerId: "miner-42",
  minerName: "Evidence Miner",
  timestamp: "2026-09-02T10:00:00.900Z",
  reasoning: "The routed Miner matched the requested CVE.",
  endpoint: null,
  costUsd: 0.01,
  durationMs: 985,
  network: "eip155:84532",
  paymentScheme: "exact",
  requestedAt: "2026-09-02T10:00:00.000Z",
  receivedAt: "2026-09-02T10:00:00.985Z",
  raw: { provider: "sanitized" },
};

function makeDecision(
  decision: "PASS" | "HOLD" | "REVIEW",
  requestedAt: string | null = telegraphEvidence.requestedAt,
): LimenDecisionResult {
  return {
    id: "decision-1",
    decision,
    reasonCode: decision === "HOLD" ? "AFFECTED_BLOCKING_DEPENDENCY" : "NO_BLOCKING_CONDITION",
    summary: "A sanitized canonical Limen decision.",
    cveId: repositoryEvidence.cveId,
    repositoryEvidence: decision === "PASS"
      ? { ...repositoryEvidence, exposureState: "patched", installedVersion: "4.18.1" }
      : repositoryEvidence,
    telegraphEvidence: decision === "PASS" ? null : { ...telegraphEvidence, requestedAt },
    checks: [],
    evaluatedAt: "2026-09-02T10:00:00.000Z",
    policyVersion: POLICY_VERSION,
  };
}

function makeRequest(
  cveId = "CVE-2021-23337",
  requestedAt: string | null = telegraphEvidence.requestedAt,
): LedgerRunIngest["telegraphRequests"][number] {
  return {
    cveId,
    intent: "CVE_LOOKUP",
    minerId: telegraphEvidence.minerId,
    minerName: telegraphEvidence.minerName,
    costUsd: telegraphEvidence.costUsd,
    durationMs: telegraphEvidence.durationMs,
    network: telegraphEvidence.network,
    paymentScheme: telegraphEvidence.paymentScheme,
    requestedAt,
    receivedAt: telegraphEvidence.receivedAt,
    outcome: "success",
    settlementReference: null,
  };
}

function makeIngest(
  decision: "PASS" | "HOLD" | "REVIEW" = "HOLD",
): LedgerRunIngest {
  const decisions = decision === "PASS" ? [] : [makeDecision(decision)];
  const requests = decision === "PASS"
    ? []
    : decision === "HOLD"
      ? Array.from({ length: 5 }, (_, index) => makeRequest(`CVE-2021-${23337 + index}`))
      : [makeRequest()];
  return {
    run: {
      repository: context.repository,
      pullRequestNumber: context.pullRequestNumber,
      baseSha: context.baseSha,
      headSha: context.headSha,
      githubRunId: RUN_ID,
      githubRunAttempt: 1,
      githubEvent: context.eventName,
      actor: context.actor,
      policyVersion: POLICY_VERSION,
      overallDecision: decision,
      runReasonCode: decision === "HOLD"
        ? "AFFECTED_BLOCKING_DEPENDENCY"
        : decision === "PASS"
          ? "NO_RELEVANT_VULNERABILITY"
          : "TELEGRAPH_UNAVAILABLE",
      runSummary: "A sanitized run summary.",
      decisionCount: decisions.length,
      passCount: decisions.filter((item) => item.decision === "PASS").length,
      holdCount: decisions.filter((item) => item.decision === "HOLD").length,
      reviewCount: decisions.filter((item) => item.decision === "REVIEW").length,
      telegraphRequestCount: requests.length,
      telegraphCostUsd: requests.reduce((total, item) => total + (item.costUsd ?? 0), 0),
      evaluatedCves: requests.map((item) => item.cveId),
      skippedCves: [],
      isTest: true,
      usageClass: "demo",
      source: "backfill",
      startedAt: "2026-09-02T10:00:00.000Z",
      completedAt: "2026-09-02T10:00:01.000Z",
    },
    decisions,
    telegraphRequests: requests,
  };
}

function makeActionResult(decision: "PASS" | "HOLD" | "REVIEW"): LimenRunResult {
  const ingest = makeIngest(decision);
  return {
    runId: "LM-action",
    overallDecision: decision,
    decisions: ingest.decisions,
    policyVersion: ingest.run.policyVersion,
    evaluatedCves: ingest.run.evaluatedCves,
    skippedCves: [],
    telegraphRequestCount: ingest.run.telegraphRequestCount,
    telegraphCostUsd: ingest.run.telegraphCostUsd,
    telegraphRequests: ingest.telegraphRequests,
    baseSha: ingest.run.baseSha,
    headSha: ingest.run.headSha,
    pullRequestNumber: ingest.run.pullRequestNumber,
    evaluatedAt: ingest.run.startedAt,
    budgetExceeded: false,
    missingCveCount: 0,
    runReasonCode: ingest.run.runReasonCode,
    runReasons: [],
    runSummary: ingest.run.runSummary,
    context,
    startedAt: ingest.run.startedAt,
    completedAt: ingest.run.completedAt,
  };
}

describe("ledger contract", () => {
  it("represents R0-shaped HOLD and zero-request PASS records", () => {
    const hold = validateLedgerRunIngest(makeIngest("HOLD"));
    const pass = validateLedgerRunIngest(makeIngest("PASS"));

    expect(hold.run.overallDecision).toBe("HOLD");
    expect(hold.telegraphRequests).toHaveLength(5);
    expect(hold.run.telegraphCostUsd).toBe(0.05);
    expect(pass.run.overallDecision).toBe("PASS");
    expect(pass.run.telegraphRequestCount).toBe(0);
    expect(pass.telegraphRequests).toEqual([]);
  });

  it("allows unknown backfill request times but requires action request times", () => {
    const backfill = makeIngest("HOLD");
    backfill.telegraphRequests.forEach((request) => { request.requestedAt = null; });
    backfill.decisions[0]!.telegraphEvidence = {
      ...telegraphEvidence,
      requestedAt: null,
    };
    backfill.decisions[0]!.evaluatedAt = null;
    expect(validateLedgerRunIngest(backfill).telegraphRequests[0]?.requestedAt).toBeNull();
    expect(validateLedgerRunIngest(backfill).decisions[0]?.telegraphEvidence?.requestedAt)
      .toBeNull();
    expect(validateLedgerRunIngest(backfill).decisions[0]?.evaluatedAt).toBeNull();

    const actionWithoutTimestamp = makeIngest("HOLD");
    actionWithoutTimestamp.run.source = "action";
    actionWithoutTimestamp.run.usageClass = "production";
    actionWithoutTimestamp.run.isTest = false;
    actionWithoutTimestamp.telegraphRequests[0]!.requestedAt = null;
    expect(() => validateLedgerRunIngest(actionWithoutTimestamp)).toThrow(/requestedAt/i);

    const actionDecisionWithoutTimestamp = makeIngest("HOLD");
    actionDecisionWithoutTimestamp.run.source = "action";
    actionDecisionWithoutTimestamp.run.usageClass = "production";
    actionDecisionWithoutTimestamp.run.isTest = false;
    actionDecisionWithoutTimestamp.decisions[0]!.telegraphEvidence = {
      ...telegraphEvidence,
      requestedAt: null,
    };
    expect(() => validateLedgerRunIngest(actionDecisionWithoutTimestamp)).toThrow(/requestedAt/i);

    const actionDecisionWithoutEvaluationTime = makeIngest("HOLD");
    actionDecisionWithoutEvaluationTime.run.source = "action";
    actionDecisionWithoutEvaluationTime.run.usageClass = "production";
    actionDecisionWithoutEvaluationTime.run.isTest = false;
    actionDecisionWithoutEvaluationTime.decisions[0]!.evaluatedAt = null;
    expect(() => validateLedgerRunIngest(actionDecisionWithoutEvaluationTime))
      .toThrow(/evaluatedAt/i);

    const actionWithTimestamp = makeIngest("HOLD");
    actionWithTimestamp.run.source = "action";
    actionWithTimestamp.run.usageClass = "production";
    actionWithTimestamp.run.isTest = false;
    const validatedAction = validateLedgerRunIngest(actionWithTimestamp);
    expect(validatedAction.telegraphRequests[0]?.requestedAt)
      .toBe("2026-09-02T10:00:00.000Z");
    expect(validatedAction.decisions[0]?.telegraphEvidence?.requestedAt)
      .toBe("2026-09-02T10:00:00.000Z");
    expect(validatedAction.decisions[0]?.evaluatedAt)
      .toBe("2026-09-02T10:00:00.000Z");
  });

  it("validates an R0-shaped five-decision HOLD with unknown historical timing", () => {
    const historical = makeIngest("HOLD");
    const template = historical.decisions[0]!;
    historical.telegraphRequests.forEach((request) => { request.requestedAt = null; });
    historical.decisions = historical.telegraphRequests.map((request, index) => ({
      ...template,
      id: `decision-${index + 1}`,
      cveId: request.cveId,
      repositoryEvidence: {
        ...template.repositoryEvidence,
        cveId: request.cveId,
      },
      telegraphEvidence: template.telegraphEvidence === null
        ? null
        : { ...template.telegraphEvidence, cveId: request.cveId, requestedAt: null },
      evaluatedAt: null,
    }));
    historical.run.decisionCount = 5;
    historical.run.holdCount = 5;

    const validated = validateLedgerRunIngest(historical);
    expect(validated.decisions).toHaveLength(5);
    expect(validated.decisions.every((decision) => decision.evaluatedAt === null)).toBe(true);
    expect(validated.telegraphRequests).toHaveLength(5);
  });

  it("rejects duplicate decisions, duplicate CVE request records, and secret fields", () => {
    const duplicateDecision = makeIngest();
    duplicateDecision.decisions.push({ ...duplicateDecision.decisions[0]! });
    duplicateDecision.run.decisionCount = 2;
    duplicateDecision.run.holdCount = 2;
    expect(() => validateLedgerRunIngest(duplicateDecision)).toThrow(/decision IDs/i);

    const duplicateRequest = makeIngest();
    duplicateRequest.telegraphRequests.push({ ...duplicateRequest.telegraphRequests[0]! });
    duplicateRequest.run.telegraphRequestCount = 6;
    duplicateRequest.run.telegraphCostUsd = 0.06;
    expect(() => validateLedgerRunIngest(duplicateRequest)).toThrow(/Telegraph CVE/i);

    const secretPayload = makeIngest();
    secretPayload.decisions[0]!.telegraphEvidence = {
      ...telegraphEvidence,
      raw: { paymentSignature: "must-not-enter-the-ledger" },
    };
    expect(() => validateLedgerRunIngest(secretPayload)).toThrow(/prohibited credential/i);
  });

  it("redacts sensitive assignment strings while preserving safe normalized evidence", () => {
    const input = makeIngest();
    input.decisions[0]!.telegraphEvidence = {
      ...telegraphEvidence,
      raw: "PAYMENT-SIGNATURE: reusable-proof",
    };

    const validated = validateLedgerRunIngest(input);
    expect(validated.decisions[0]!.telegraphEvidence?.raw).toBe(
      "PAYMENT-SIGNATURE: [REDACTED]",
    );
    expect(validated.decisions[0]!.telegraphEvidence?.minerName).toBe("Evidence Miner");
  });

  it("allows only an explicit demo backfill path for historical records", async () => {
    const ledger = { persistRun: vi.fn().mockResolvedValue({ id: "LM-RUN-TEST-001", created: true }) };
    await expect(backfillSanitizedRun(ledger, makeIngest("HOLD"))).resolves.toEqual({
      id: "LM-RUN-TEST-001",
      created: true,
    });

    const productionInput = makeIngest("PASS");
    productionInput.run.usageClass = "production";
    productionInput.run.isTest = false;
    await expect(backfillSanitizedRun(ledger, productionInput)).rejects.toThrow(
      "source=backfill and usageClass=demo",
    );
  });
});

describe("Action ledger optionality", () => {
  it("builds one complete sanitized package with demo classification", () => {
    const ingest = buildLedgerRunIngest(makeActionResult("HOLD"), "demo");
    expect(ingest).not.toBeNull();
    expect(ingest?.run).toMatchObject({
      githubRunId: RUN_ID,
      githubRunAttempt: 1,
      usageClass: "demo",
      isTest: true,
      source: "action",
    });
    expect(ingest?.decisions[0]?.decision).toBe("HOLD");
  });

  it.each(["PASS", "HOLD", "REVIEW"] as const)(
    "preserves %s when ledger persistence fails",
    async (decision) => {
      const warnings: string[] = [];
      const result = await persistActionLedger(
        makeActionResult(decision),
        { ledgerUrl: "https://ledger.example.test", ledgerToken: "token", usageClass: "production" },
        { warning: (message) => warnings.push(message) },
        () => ({ persistRun: vi.fn().mockRejectedValue(new Error("unavailable")) }),
      );

      expect(result.overallDecision).toBe(decision);
      expect(result.ledgerPersisted).toBe(false);
      expect(result.ledgerStatus).toBe("failed");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).not.toContain("token");
    },
  );

  it("skips persistence when ledger configuration is absent", async () => {
    const warnings: string[] = [];
    const result = await persistActionLedger(
      makeActionResult("HOLD"),
      { usageClass: "production" },
      { warning: (message) => warnings.push(message) },
    );
    expect(result.overallDecision).toBe("HOLD");
    expect(result.ledgerStatus).toBe("not-configured");
    expect(warnings).toEqual([]);
  });
});

describe("ledger outbound origin boundary", () => {
  it("requires HTTPS for hosted Supabase while allowing explicit localhost development", () => {
    const base = {
      SUPABASE_SERVICE_ROLE_KEY: "service-role-placeholder",
      LIMEN_INGEST_TOKEN: "ingest-placeholder",
    };
    expect(() => loadLedgerApiConfig({
      ...base,
      SUPABASE_URL: "http://supabase.attacker.example",
    })).toThrow();
    expect(loadLedgerApiConfig({
      ...base,
      SUPABASE_URL: "http://127.0.0.1:54321",
    }).supabaseUrl).toBe("http://127.0.0.1:54321");
  });

  it("allows localhost development URLs but rejects remote HTTP and unsafe redirects", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data",
      "http://ledger.attacker.example",
      "https://ledger.example.test?redirect=https://attacker.example",
      "https://user:password@ledger.example.test",
    ]) {
      const rejectedFetch = vi.fn();
      const rejected = new LedgerIngestClient({
        url,
        token: "ledger-secret",
        fetch: rejectedFetch,
      });
      await expect(rejected.persistRun(makeIngest("PASS"))).rejects.toThrow(LedgerClientError);
      expect(rejectedFetch).not.toHaveBeenCalled();
    }

    const calls: RequestInit[] = [];
    const localhost = new LedgerIngestClient({
      url: "http://127.0.0.1:8787",
      token: "ledger-secret",
      fetch: (input, init) => {
        void input;
        calls.push(init ?? {});
        return Promise.resolve(new Response(JSON.stringify({ id: "LM-RUN-TEST-001", created: true }), { status: 200 }));
      },
    });
    await expect(localhost.persistRun(makeIngest("PASS"))).resolves.toEqual({
      id: "LM-RUN-TEST-001",
      created: true,
    });
    expect(calls[0]?.redirect).toBe("error");

    const redirectCalls: RequestInit[] = [];
    const redirected = new LedgerIngestClient({
      url: "https://ledger.example.test",
      token: "ledger-secret",
      fetch: (input, init) => {
        void input;
        redirectCalls.push(init ?? {});
        return Promise.resolve(new Response("", {
          status: 302,
          headers: { location: "https://attacker.example/collect" },
        }));
      },
    });
    await expect(redirected.persistRun(makeIngest("PASS"))).rejects.toThrow(LedgerClientError);
    expect(redirectCalls).toHaveLength(1);
    expect(redirectCalls[0]?.redirect).toBe("error");
  });
});

describe("ledger ingest API", () => {
  let server: ReturnType<typeof createLedgerServer> | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("requires a token, accepts a correct token, and retrieves by stable ID", async () => {
    const detail: PersistedRunDetail = {
      run: { ...makeIngest("PASS").run, id: "LM-RUN-TEST-001" },
      decisions: [],
      telegraphRequests: [],
    };
    const ledger: EvidenceLedger = {
      persistRun: vi.fn().mockResolvedValue({ id: detail.run.id, created: true }),
      getRun: vi.fn().mockResolvedValue(detail),
    };
    server = createLedgerServer({ ledger, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    const payload = JSON.stringify(makeIngest("PASS"));

    const missing = await fetch(`${url}/v1/ledger/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    expect(missing.status).toBe(401);

    const wrong = await fetch(`${url}/v1/ledger/runs`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: payload,
    });
    expect(wrong.status).toBe(401);

    const accepted = await fetch(`${url}/v1/ledger/runs`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      body: payload,
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ id: "LM-RUN-TEST-001", created: true });

    const retrieved = await fetch(`${url}/v1/ledger/runs/LM-RUN-TEST-001`, {
      headers: { authorization: "Bearer ingest-secret" },
    });
    expect(retrieved.status).toBe(200);
    expect(await retrieved.json()).toMatchObject({ run: { id: "LM-RUN-TEST-001" } });
  });

  it("rejects secret-bearing payload fields before repository access", async () => {
    const ledger: EvidenceLedger = {
      persistRun: vi.fn(),
      getRun: vi.fn(),
    };
    server = createLedgerServer({ ledger, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;
    const secretPayload = makeIngest();
    secretPayload.decisions[0]!.telegraphEvidence = {
      ...telegraphEvidence,
      raw: { githubToken: "must-not-enter-the-ledger" },
    };

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/ledger/runs`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      body: JSON.stringify(secretPayload),
    });
    expect(response.status).toBe(400);
    expect(ledger.persistRun).not.toHaveBeenCalled();
  });

  it("maps an idempotency conflict to 409 without exposing database details", async () => {
    const ledger: EvidenceLedger = {
      persistRun: vi.fn().mockRejectedValue(new LedgerConflictError()),
      getRun: vi.fn(),
    };
    server = createLedgerServer({ ledger, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/ledger/runs`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      body: JSON.stringify(makeIngest("PASS")),
    });

    expect(response.status).toBe(409);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      code: "LEDGER_IDEMPOTENCY_CONFLICT",
      message: "This GitHub run attempt already exists with different evidence.",
    });
    expect(JSON.stringify(body)).not.toContain("P0001");
    expect(JSON.stringify(body)).not.toContain("database");
  });

  it("keeps generic persistence failures at 500 with a safe response", async () => {
    const ledger: EvidenceLedger = {
      persistRun: vi.fn().mockRejectedValue(new LedgerPersistenceError("internal database secret")),
      getRun: vi.fn(),
    };
    server = createLedgerServer({ ledger, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/ledger/runs`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      body: JSON.stringify(makeIngest("PASS")),
    });

    expect(response.status).toBe(500);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      code: "LEDGER_PERSISTENCE_ERROR",
      message: "The evidence ledger is temporarily unavailable.",
    });
    expect(JSON.stringify(body)).not.toContain("internal database secret");
  });
});

describe("Supabase repository boundary", () => {
  it("uses the atomic RPC and never serializes service credentials", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "LM-RUN-TEST-001", created: true },
      error: null,
    });
    const repository = new SupabaseEvidenceLedger({ rpc } as unknown as SupabaseClient);

    const input = makeIngest("HOLD");
    await expect(repository.persistRun(input)).resolves.toEqual({
      id: "LM-RUN-TEST-001",
      created: true,
    });
    expect(rpc).toHaveBeenCalledWith("persist_limen_run", {
      payload: expect.objectContaining({ run: expect.objectContaining({ source: "backfill" }) }),
    });
    expect(rpc.mock.calls[0]?.[1].payload.decisions[0].telegraphEvidence.raw).toBeNull();
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("classifies only the exact RPC idempotency conflict", async () => {
    const knownConflict = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Ledger idempotency key conflicts with an existing run.",
        details: "sensitive database details",
        hint: "sensitive database hint",
      },
    });
    const conflictRepository = new SupabaseEvidenceLedger({
      rpc: knownConflict,
    } as unknown as SupabaseClient);
    await expect(conflictRepository.persistRun(makeIngest("PASS")))
      .rejects.toThrowError(LedgerConflictError);

    const otherP0001 = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "A different database rule failed.",
        details: "sensitive database details",
        hint: "sensitive database hint",
      },
    });
    const otherRepository = new SupabaseEvidenceLedger({
      rpc: otherP0001,
    } as unknown as SupabaseClient);
    await expect(otherRepository.persistRun(makeIngest("PASS")))
      .rejects.toThrowError(LedgerPersistenceError);
  });

  it("returns an exact duplicate result without changing its meaning", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "LM-RUN-TEST-001", created: false },
      error: null,
    });
    const repository = new SupabaseEvidenceLedger({ rpc } as unknown as SupabaseClient);

    await expect(repository.persistRun(makeIngest("PASS"))).resolves.toEqual({
      id: "LM-RUN-TEST-001",
      created: false,
    });
  });

  it("maps stored run, canonical decisions, and Telegraph records on retrieval", async () => {
    const source = makeIngest("HOLD");
    const runRow = {
      id: "LM-RUN-TEST-001",
      repository: source.run.repository,
      pull_request_number: source.run.pullRequestNumber,
      base_sha: source.run.baseSha,
      head_sha: source.run.headSha,
      github_run_id: String(source.run.githubRunId),
      github_run_attempt: String(source.run.githubRunAttempt),
      github_event: source.run.githubEvent,
      actor: source.run.actor,
      policy_version: source.run.policyVersion,
      overall_decision: source.run.overallDecision,
      run_reason_code: source.run.runReasonCode,
      run_summary: source.run.runSummary,
      decision_count: String(source.run.decisionCount),
      pass_count: String(source.run.passCount),
      hold_count: String(source.run.holdCount),
      review_count: String(source.run.reviewCount),
      telegraph_request_count: String(source.run.telegraphRequestCount),
      telegraph_cost_usd: source.run.telegraphCostUsd.toFixed(2),
      evaluated_cves: source.run.evaluatedCves,
      skipped_cves: source.run.skippedCves,
      is_test: source.run.isTest,
      usage_class: source.run.usageClass,
      source: source.run.source,
      started_at: source.run.startedAt,
      completed_at: source.run.completedAt,
    };
    const decision = source.decisions[0]!;
    const decisionRow = {
      decision_id: decision.id,
      decision: decision.decision,
      reason_code: decision.reasonCode,
      summary: decision.summary,
      cve_id: decision.cveId,
      repository_evidence: decision.repositoryEvidence,
      telegraph_evidence: decision.telegraphEvidence,
      checks: decision.checks,
      evaluated_at: null,
      policy_version: decision.policyVersion,
    };
    const requestRows = source.telegraphRequests.map((request, index) => ({
      cve_id: request.cveId,
      intent: request.intent,
      miner_id: request.minerId,
      miner_name: request.minerName,
      cost_usd: request.costUsd?.toFixed(2),
      duration_ms: String(request.durationMs),
      network: request.network,
      payment_scheme: request.paymentScheme,
      requested_at: index === 0 ? null : request.requestedAt,
      received_at: request.receivedAt,
      outcome: request.outcome,
      settlement_reference: request.settlementReference,
    }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "runs") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: runRow, error: null }) }) }) };
        }
        if (table === "decisions") {
          return { select: () => ({ eq: () => ({ order: async () => ({ data: [decisionRow], error: null }) }) }) };
        }
        return { select: () => ({ eq: () => ({ order: async () => ({ data: requestRows, error: null }) }) }) };
      }),
    };
    const repository = new SupabaseEvidenceLedger(client as unknown as SupabaseClient);

    const retrieved = await repository.getRun("LM-RUN-TEST-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.run).toMatchObject({ overallDecision: "HOLD", usageClass: "demo" });
    expect(retrieved?.decisions).toMatchObject([{ id: "decision-1", decision: "HOLD" }]);
    expect(retrieved?.decisions[0]?.evaluatedAt).toBeNull();
    expect(retrieved?.telegraphRequests).toHaveLength(5);
    expect(retrieved?.telegraphRequests[0]?.requestedAt).toBeNull();
    expect(retrieved?.telegraphRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ cveId: "CVE-2021-23337", costUsd: 0.01 }),
      expect.objectContaining({ cveId: "CVE-2021-23341", costUsd: 0.01 }),
    ]));
  });

  it("returns a typed persistence error when the atomic RPC fails", async () => {
    const repository = new SupabaseEvidenceLedger({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("database unavailable") }),
    } as unknown as SupabaseClient);

    await expect(repository.persistRun(makeIngest("PASS"))).rejects.toThrowError(
      LedgerPersistenceError,
    );
  });

  it("declares the database idempotency, foreign-key, and RLS constraints", async () => {
    const migration = await readFile(
      "supabase/migrations/20260902000000_create_evidence_ledger.sql",
      "utf8",
    );
    expect(migration).toContain("unique (github_run_id, github_run_attempt)");
    expect(migration).toContain("unique (run_id, decision_id)");
    expect(migration).toContain("unique (run_id, cve_id)");
    expect(migration).toContain("on conflict (github_run_id, github_run_attempt) do nothing");
    expect(migration).toContain("payload_hash");
    expect(migration).toContain("incoming_payload_hash := md5(");
    expect(migration).toContain("references public.runs(id) on delete cascade");
    expect(migration).toContain("alter table public.runs enable row level security");
    expect(migration).toContain("revoke all on table public.runs, public.decisions, public.telegraph_requests from anon, authenticated");
    expect(migration).toContain("persist_limen_run(payload jsonb)");

    const additiveMigration = await readFile(
      "supabase/migrations/20260902010000_allow_null_backfill_telegraph_requested_at.sql",
      "utf8",
    );
    expect(additiveMigration).toContain("alter column requested_at drop not null");

    const decisionTimestampMigration = await readFile(
      "supabase/migrations/20260902020000_allow_null_backfill_decision_evaluated_at.sql",
      "utf8",
    );
    expect(decisionTimestampMigration).toContain("alter column evaluated_at drop not null");
  });
});
