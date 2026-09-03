import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PersistedRunSchema,
  isLedgerRunId,
  validatePersistedRunDetail,
  validateLedgerRunIngest,
} from "../../../packages/ledger/src";
import type { LimenDecisionResult } from "../../../packages/core/src";
import type {
  EvidenceLedger,
  LedgerRunIngest,
  PersistedRun,
  PersistedRunDetail,
} from "../../../packages/ledger/src";

const LEDGER_IDEMPOTENCY_CONFLICT_CODE = "P0001";
const LEDGER_IDEMPOTENCY_CONFLICT_MESSAGE =
  "Ledger idempotency key conflicts with an existing run.";

export class LedgerConflictError extends Error {
  readonly code = "LEDGER_IDEMPOTENCY_CONFLICT" as const;

  constructor() {
    super("This GitHub run attempt already exists with different evidence.");
    this.name = "LedgerConflictError";
  }
}

export class LedgerPersistenceError extends Error {
  readonly code = "LEDGER_PERSISTENCE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerPersistenceError";
  }
}

function objectRow(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numericRow(value: unknown): unknown {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function mapRun(rowValue: unknown): PersistedRunDetail["run"] {
  const row = objectRow(rowValue);
  return {
    id: row.id,
    repository: row.repository,
    pullRequestNumber: row.pull_request_number,
    baseSha: row.base_sha,
    headSha: row.head_sha,
    githubRunId: numericRow(row.github_run_id),
    githubRunAttempt: numericRow(row.github_run_attempt),
    githubEvent: row.github_event,
    actor: row.actor,
    policyVersion: row.policy_version,
    overallDecision: row.overall_decision,
    runReasonCode: row.run_reason_code,
    runSummary: row.run_summary,
    decisionCount: numericRow(row.decision_count),
    passCount: numericRow(row.pass_count),
    holdCount: numericRow(row.hold_count),
    reviewCount: numericRow(row.review_count),
    telegraphRequestCount: numericRow(row.telegraph_request_count),
    telegraphCostUsd: numericRow(row.telegraph_cost_usd),
    evaluatedCves: row.evaluated_cves,
    skippedCves: row.skipped_cves,
    isTest: row.is_test,
    usageClass: row.usage_class,
    source: row.source,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  } as PersistedRunDetail["run"];
}

function mapDecision(rowValue: unknown): unknown {
  const row = objectRow(rowValue);
  return {
    id: row.decision_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    summary: row.summary,
    cveId: row.cve_id,
    repositoryEvidence: row.repository_evidence,
    telegraphEvidence: row.telegraph_evidence,
    checks: row.checks,
    evaluatedAt: row.evaluated_at === null ? null : row.evaluated_at,
    policyVersion: row.policy_version,
  };
}

function mapTelegraphRequest(rowValue: unknown): unknown {
  const row = objectRow(rowValue);
  return {
    cveId: row.cve_id,
    intent: row.intent,
    minerId: row.miner_id,
    minerName: row.miner_name,
    costUsd: row.cost_usd === null ? null : numericRow(row.cost_usd),
    durationMs: row.duration_ms === null ? null : numericRow(row.duration_ms),
    network: row.network,
    paymentScheme: row.payment_scheme,
    requestedAt: row.requested_at === null ? null : row.requested_at,
    receivedAt: row.received_at,
    outcome: row.outcome,
    settlementReference: row.settlement_reference,
  };
}

function removeProviderPayload(
  decision: LimenDecisionResult,
): LimenDecisionResult {
  return {
    ...decision,
    telegraphEvidence: decision.telegraphEvidence === null
      ? null
      : { ...decision.telegraphEvidence, raw: null },
  };
}

export class SupabaseEvidenceLedger implements EvidenceLedger {
  constructor(private readonly client: SupabaseClient) {}

  async persistRun(input: LedgerRunIngest): Promise<PersistedRun> {
    const sanitized = validateLedgerRunIngest(input);
    const storageInput: LedgerRunIngest = {
      ...sanitized,
      decisions: sanitized.decisions.map(removeProviderPayload),
    };
    const { data, error } = await this.client.rpc("persist_limen_run", {
      payload: storageInput,
    });
    if (error) {
      if (
        error.code === LEDGER_IDEMPOTENCY_CONFLICT_CODE &&
        error.message === LEDGER_IDEMPOTENCY_CONFLICT_MESSAGE
      ) {
        throw new LedgerConflictError();
      }
      throw new LedgerPersistenceError("The evidence ledger could not persist the run.");
    }

    const parsed = PersistedRunSchema.safeParse(data);
    if (!parsed.success) {
      throw new LedgerPersistenceError("The evidence ledger returned an invalid persistence result.");
    }
    return parsed.data;
  }

  async getRun(id: string): Promise<PersistedRunDetail | null> {
    if (!isLedgerRunId(id)) {
      return null;
    }

    const runResult = await this.client
      .from("runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (runResult.error) {
      throw new LedgerPersistenceError("The evidence ledger could not read the run.");
    }
    if (runResult.data === null) {
      return null;
    }

    const [decisionsResult, telegraphResult] = await Promise.all([
      this.client
        .from("decisions")
        .select("*")
        .eq("run_id", id)
        .order("created_at", { ascending: true }),
      this.client
        .from("telegraph_requests")
        .select("*")
        .eq("run_id", id)
        .order("created_at", { ascending: true }),
    ]);
    if (decisionsResult.error || telegraphResult.error) {
      throw new LedgerPersistenceError("The evidence ledger could not read run evidence.");
    }

    try {
      return validatePersistedRunDetail({
        run: mapRun(runResult.data),
        decisions: (decisionsResult.data ?? []).map(mapDecision),
        telegraphRequests: (telegraphResult.data ?? []).map(mapTelegraphRequest),
      });
    } catch {
      throw new LedgerPersistenceError("The evidence ledger returned invalid stored evidence.");
    }
  }
}
