import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createObservabilityLogger,
  LimenObservabilityEventSchema,
  parseLimenPolicy,
  serializeObservabilityEvent,
  startObservabilityStage,
  TelegraphPaymentError,
  type LimenObservabilityEvent,
  type TelegraphCveEvidence,
} from "../packages/core/src";
import { createLedgerServer } from "../apps/api/src";
import {
  GitHubDependencySnapshotWarningError,
  type GitHubClient,
  type GitHubDependencyReviewChangeDto,
  type GitHubGlobalAdvisoryDto,
} from "../packages/github/src";
import type { EvidenceReceiptStore } from "../packages/receipts/src";
import { orchestrateLimenRun } from "../action/src/orchestrate";
import { persistActionLedger } from "../action/src/persist";
import { renderSummary } from "../action/src/summary";
import { setActionOutputs } from "../action/src/outputs";
import type { ActionPullRequestContext, LimenRunResult } from "../action/src/types";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const CVE_ID = "CVE-2026-1234";
const policy = parseLimenPolicy(`production:
  block_severity: [high]
  dependency_scopes: [runtime]
`);
const context: ActionPullRequestContext = {
  owner: "owner",
  repo: "repo",
  repository: "owner/repo",
  pullRequestNumber: 42,
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
  actor: "octocat",
  eventName: "pull_request",
  authorAssociation: "MEMBER",
  githubRunId: 12345,
  githubRunAttempt: 1,
};

function captureLogger(): {
  events: LimenObservabilityEvent[];
  lines: string[];
  logger: ReturnType<typeof createObservabilityLogger>;
} {
  const events: LimenObservabilityEvent[] = [];
  const lines: string[] = [];
  const write = (message: string) => { lines.push(message); };
  return {
    events,
    lines,
    logger: createObservabilityLogger(
      { info: write, warning: write, error: write },
      (event) => { events.push(event); },
    ),
  };
}

function makeChange(): GitHubDependencyReviewChangeDto {
  return {
    change_type: "added",
    manifest: "package-lock.json",
    ecosystem: "npm",
    name: "demo-package",
    version: "1.0.0",
    package_url: null,
    license: null,
    source_repository_url: null,
    scope: "runtime",
    relationship: "direct",
    vulnerabilities: [{
      severity: "high",
      advisory_ghsa_id: "GHSA-TEST-1234-LIMEN",
      advisory_summary: "A test advisory",
      advisory_url: "https://github.com/advisories/GHSA-TEST-1234-LIMEN",
    }],
  };
}

function makeAdvisory(): GitHubGlobalAdvisoryDto {
  return {
    ghsa_id: "GHSA-TEST-1234-LIMEN",
    cve_id: CVE_ID,
    summary: "A test advisory",
    description: "A test vulnerability.",
    severity: "high",
    identifiers: [
      { type: "GHSA", value: "GHSA-TEST-1234-LIMEN" },
      { type: "CVE", value: CVE_ID },
    ],
    references: [],
    vulnerabilities: [{
      package: { ecosystem: "npm", name: "demo-package" },
      vulnerable_version_range: "<2.0.0",
      first_patched_version: "2.0.0",
      vulnerable_functions: [],
    }],
    cvss: { score: 7.5 },
    cvss_severities: null,
  };
}

function makeGitHub(changes: GitHubDependencyReviewChangeDto[] = [makeChange()]): GitHubClient & {
  compareDependencies: ReturnType<typeof vi.fn>;
} {
  return {
    compareDependencies: vi.fn().mockResolvedValue({
      data: { changes, warnings: [] },
      metadata: { status: 200, rateLimit: null, requestId: null },
    }),
    getGlobalAdvisory: vi.fn().mockResolvedValue({
      data: makeAdvisory(),
      metadata: { status: 200, rateLimit: null, requestId: null },
    }),
    listDependabotAlerts: vi.fn(),
    getRepositoryFile: vi.fn(),
  } as unknown as GitHubClient & { compareDependencies: ReturnType<typeof vi.fn> };
}

function makeEvidence(costUsd: number | null): TelegraphCveEvidence {
  return {
    cveId: CVE_ID,
    severity: "HIGH",
    cvssScore: 7.5,
    description: "A routed test result.",
    references: [],
    affectedVersions: ["<2.0.0"],
    fixedVersions: ["2.0.0"],
    fixAvailable: true,
    intent: "CVE_LOOKUP",
    minerId: "miner-test",
    minerName: "Test Miner",
    timestamp: null,
    reasoning: null,
    endpoint: null,
    costUsd,
    durationMs: 123,
    network: "eip155:84532",
    paymentScheme: "exact",
    requestedAt: "2026-09-04T10:00:00.000Z",
    receivedAt: "2026-09-04T10:00:00.123Z",
    raw: {},
  };
}

function makeActionResult(): LimenRunResult {
  return {
    runId: "LM-action-test",
    overallDecision: "PASS",
    decisions: [],
    policyVersion: "LP-test",
    evaluatedCves: [],
    skippedCves: [],
    telegraphRequestCount: 0,
    telegraphCostUsd: 0,
    telegraphRequests: [],
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    pullRequestNumber: context.pullRequestNumber,
    evaluatedAt: "2026-09-04T10:00:00.000Z",
    budgetExceeded: false,
    missingCveCount: 0,
    runReasonCode: "NO_RELEVANT_VULNERABILITY",
    runReasons: [],
    runSummary: "No relevant vulnerability was found.",
    context,
    startedAt: "2026-09-04T10:00:00.000Z",
    completedAt: "2026-09-04T10:00:00.100Z",
  };
}

describe("structured observability", () => {
  it("validates a correlation envelope and excludes secret-bearing fields", () => {
    const secrets = {
      privateKey: "private-key-secret",
      githubToken: "github-token-secret",
      ledgerToken: "ledger-token-secret",
      authorization: "Bearer authorization-secret",
      paymentSignature: "payment-signature-secret",
      paymentProof: "payment-proof-secret",
      supabaseServiceRoleKey: "supabase-service-role-secret",
      rawTelegraphPayload: "PAYMENT-SIGNATURE: payment-proof-secret provider-body-secret",
    };
    const serialized = serializeObservabilityEvent({
      timestamp: "2026-09-04T10:00:00.000Z",
      level: "info",
      event: "SUCCESS",
      stage: "telegraph-cve-lookup",
      limenRunId: "LM-test-run",
      githubRunId: 12345,
      githubRunAttempt: 1,
      repository: "owner/repo",
      pullRequestNumber: 42,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      policyVersion: "LP-test",
      cve: CVE_ID,
      intent: "CVE_LOOKUP",
      costUsd: null,
      ...secrets,
    });

    expect(serialized).not.toContain("private-key-secret");
    expect(serialized).not.toContain("github-token-secret");
    expect(serialized).not.toContain("ledger-token-secret");
    expect(serialized).not.toContain("authorization-secret");
    expect(serialized).not.toContain("payment-signature-secret");
    expect(serialized).not.toContain("payment-proof-secret");
    expect(serialized).not.toContain("supabase-service-role-secret");
    expect(serialized).not.toContain("provider-body-secret");
    const parsed = JSON.parse(serialized.replace("LIMEN_OBSERVABILITY ", "")) as unknown;
    expect(LimenObservabilityEventSchema.parse(parsed)).toMatchObject({
      stage: "telegraph-cve-lookup",
      limenRunId: "LM-test-run",
      cve: CVE_ID,
      costUsd: null,
    });
  });

  it("emits START and terminal events with duration and classified errors", () => {
    const { events, logger } = captureLogger();
    const stage = startObservabilityStage(
      logger,
      "policy-retrieval",
      { limenRunId: "LM-stage-test" },
      () => new Date("2026-09-04T10:00:00.000Z"),
    );
    stage.success({ policyVersion: "LP-test" });
    const failure = startObservabilityStage(
      logger,
      "telegraph-cve-lookup",
      { limenRunId: "LM-stage-test" },
    );
    failure.failure(new TelegraphPaymentError("Payment failed", {
      paymentProof: "proof-that-must-not-be-logged",
      status: 402,
    }));

    expect(events.map((event) => `${event.stage}:${event.event}`)).toEqual([
      "policy-retrieval:START",
      "policy-retrieval:SUCCESS",
      "telegraph-cve-lookup:START",
      "telegraph-cve-lookup:FAILURE",
    ]);
    expect(events[0]?.durationMs).toBeUndefined();
    expect(events[1]?.durationMs).toEqual(expect.any(Number));
    expect(events[3]).toMatchObject({
      errorCode: "TELEGRAPH_PAYMENT_ERROR",
      httpStatus: 402,
      outcome: "failed",
    });
  });
});

describe("Action telemetry", () => {
  it("exposes bounded Dependency Review retries and exhaustion", async () => {
    const github = makeGitHub([]);
    github.compareDependencies
      .mockRejectedValueOnce(new GitHubDependencySnapshotWarningError("stale"))
      .mockRejectedValueOnce(new GitHubDependencySnapshotWarningError("stale"))
      .mockResolvedValueOnce({
        data: { changes: [], warnings: [] },
        metadata: { status: 200, rateLimit: null, requestId: null },
      });
    const firstCapture = captureLogger();
    const result = await orchestrateLimenRun({
      context,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        sleep: vi.fn().mockResolvedValue(undefined),
        createRunId: () => "LM-retry-test",
        observability: firstCapture.logger,
      },
    });

    expect(result.overallDecision).toBe("PASS");
    expect(firstCapture.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: "dependency-review",
        event: "FAILURE",
        outcome: "retrying",
        attempt: 1,
        maxAttempts: 3,
      }),
      expect.objectContaining({
        stage: "dependency-review",
        event: "SUCCESS",
        attempt: 3,
        retryCount: 2,
        durationMs: expect.any(Number),
      }),
    ]));

    github.compareDependencies.mockRejectedValue(new GitHubDependencySnapshotWarningError("stale"));
    const exhaustedCapture = captureLogger();
    const exhausted = await orchestrateLimenRun({
      context,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        sleep: vi.fn().mockResolvedValue(undefined),
        createRunId: () => "LM-exhausted-test",
        observability: exhaustedCapture.logger,
      },
    });
    expect(exhausted.overallDecision).toBe("REVIEW");
    expect(exhaustedCapture.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: "dependency-review",
        event: "FAILURE",
        outcome: "failed",
        attempt: 3,
        maxAttempts: 3,
        durationMs: expect.any(Number),
      }),
    ]));
  });

  it("records Telegraph success metadata and keeps unknown cost unknown", async () => {
    const capture = captureLogger();
    const result = await orchestrateLimenRun({
      context,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: makeGitHub(),
        createRunId: () => "LM-telegraph-success",
        observability: capture.logger,
        telegraphClientFactory: () => ({
          lookupCve: vi.fn().mockResolvedValue(makeEvidence(null)),
        }),
      },
    });
    const lookup = capture.events.find((event) =>
      event.stage === "telegraph-cve-lookup" && event.event === "SUCCESS",
    );
    expect(lookup).toMatchObject({
      cve: CVE_ID,
      intent: "CVE_LOOKUP",
      costUsd: null,
      providerDurationMs: 123,
      network: "eip155:84532",
      paymentScheme: "exact",
      requestedAt: "2026-09-04T10:00:00.000Z",
      receivedAt: "2026-09-04T10:00:00.123Z",
      durationMs: expect.any(Number),
      outcome: "success",
    });
    expect(result.telegraphCostKnown).toBe(false);
    const outputs: Record<string, string> = {};
    setActionOutputs(result, { setOutput: (name, value) => { outputs[name] = value; } });
    expect(outputs["telegraph-cost-usd"]).toBe("");
    expect(renderSummary(result, capture.events)).toContain("Cost: `not fully reported`");
    expect(renderSummary(result, capture.events)).not.toContain("0.000000");
  });

  it("records classified Telegraph failures without payment material", async () => {
    const secret = "raw-payment-proof-secret";
    const capture = captureLogger();
    const result = await orchestrateLimenRun({
      context,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: makeGitHub(),
        createRunId: () => "LM-telegraph-failure",
        observability: capture.logger,
        telegraphClientFactory: () => ({
          lookupCve: vi.fn().mockRejectedValue(new TelegraphPaymentError(
            "Telegraph payment failed",
            { paymentProof: secret, status: 402 },
          )),
        }),
      },
    });
    const failure = capture.events.find((event) =>
      event.stage === "telegraph-cve-lookup" && event.event === "FAILURE",
    );
    expect(result).toMatchObject({
      overallDecision: "REVIEW",
      telegraphCostKnown: false,
    });
    expect(failure).toMatchObject({
      cve: CVE_ID,
      intent: "CVE_LOOKUP",
      costUsd: null,
      errorCode: "TELEGRAPH_PAYMENT_ERROR",
      httpStatus: 402,
      outcome: "failed",
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(capture.events)).not.toContain(secret);
    expect(result.telegraphRequests[0]).toMatchObject({
      cveId: CVE_ID,
      intent: "CVE_LOOKUP",
      costUsd: null,
      outcome: "failed",
    });
  });
});

describe("ledger and API telemetry", () => {
  it("reports ledger persistence timing and safe failure classification", async () => {
    const success = await persistActionLedger(
      makeActionResult(),
      { ledgerUrl: "https://ledger.example.test", ledgerToken: "ledger-secret", usageClass: "production" },
      { warning: vi.fn() },
      () => ({ persistRun: vi.fn().mockResolvedValue({ id: "LM-RUN-LEDGER-TEST", created: true }) }),
    );
    expect(success).toMatchObject({
      ledgerStatus: "recorded",
      ledgerPersisted: true,
      ledgerRunId: "LM-RUN-LEDGER-TEST",
      ledgerPersistenceDurationMs: expect.any(Number),
    });

    const failed = await persistActionLedger(
      makeActionResult(),
      { ledgerUrl: "https://ledger.example.test", ledgerToken: "ledger-secret", usageClass: "production" },
      { warning: vi.fn() },
      () => ({
        persistRun: vi.fn().mockRejectedValue({
          code: "LEDGER_CLIENT_ERROR",
          responseCode: "LEDGER_PERSISTENCE_ERROR",
          status: 500,
        }),
      }),
    );
    expect(failed).toMatchObject({
      ledgerStatus: "failed",
      ledgerErrorCode: "LEDGER_PERSISTENCE_ERROR",
      ledgerHttpStatus: 500,
      ledgerPersistenceDurationMs: expect.any(Number),
    });
  });

  it("adds safe API request IDs and preserves public receipt statuses", async () => {
    let server: ReturnType<typeof createLedgerServer> | undefined;
    const capture = captureLogger();
    const activeId = "LM-REC-ACTIVE01";
    const revokedId = "LM-REC-REVOKED01";
    const receipts: EvidenceReceiptStore = {
      publishReceipt: vi.fn(),
      getReceipt: vi.fn().mockImplementation(async (id: string) => {
        if (id === activeId) {
          return { status: "active", receipt: { id: activeId } } as never;
        }
        if (id === revokedId) {
          return { status: "revoked", receipt: { id: revokedId, revokedAt: "2026-09-04T10:00:00.000Z" } };
        }
        return null;
      }),
      revokeReceipt: vi.fn(),
    };
    try {
      server = createLedgerServer({
        ledger: { persistRun: vi.fn(), getRun: vi.fn() },
        receipts,
        ingestToken: "ledger-secret",
        observability: capture.logger,
        requestIdFactory: (() => {
          let index = 0;
          return () => `LM-REQ-TEST-${++index}`;
        })(),
      });
      await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
      const address = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${address.port}`;

      const unauthorized = await fetch(`${url}/v1/ledger/runs/LM-RUN-TEST001`);
      const active = await fetch(`${url}/v1/receipts/${activeId}`);
      const unknown = await fetch(`${url}/v1/receipts/LM-REC-UNKNOWN01`);
      const revoked = await fetch(`${url}/v1/receipts/${revokedId}`);

      expect(unauthorized.status).toBe(401);
      expect(active.status).toBe(200);
      expect(await active.json()).toEqual({ id: activeId });
      expect(unknown.status).toBe(404);
      expect(revoked.status).toBe(410);
      expect(unauthorized.headers.get("x-request-id")).toBe("LM-REQ-TEST-1");
      expect(capture.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: "FAILURE",
          stage: "api-request",
          requestId: "LM-REQ-TEST-1",
          method: "GET",
          route: "/v1/ledger/runs/:id",
          httpStatus: 401,
          errorCode: "LEDGER_UNAUTHORIZED",
          durationMs: expect.any(Number),
        }),
        expect.objectContaining({
          event: "SUCCESS",
          stage: "api-request",
          requestId: "LM-REQ-TEST-2",
          route: "/v1/receipts/:id",
          httpStatus: 200,
        }),
        expect.objectContaining({ httpStatus: 404, errorCode: "RECEIPT_NOT_FOUND" }),
        expect.objectContaining({ httpStatus: 410, errorCode: "RECEIPT_REVOKED" }),
      ]));
      expect(capture.lines.join("\n")).not.toContain("ledger-secret");
    } finally {
      if (server !== undefined) {
        await new Promise<void>((resolve) => server?.close(() => resolve()));
      }
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
