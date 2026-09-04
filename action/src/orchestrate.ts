import { randomUUID } from "node:crypto";
import {
  evaluateLimenDecision,
  isLimenError,
  observabilityErrorFields,
  startObservabilityStage,
  type LimenCorrelationContext,
  type LimenObservabilityLogger,
  type LimenPolicy,
  type RepositoryExposureEvidence,
  type TelegraphCveEvidence,
  type TelegraphEvidenceInput,
  type TelegraphFailureCode,
} from "../../packages/core/src";
import {
  GitHubAdvisoryNotFoundError,
  GitHubDependencySnapshotWarningError,
  GitHubEvidenceConflictError,
  normalizeDependencyReviewEvidence,
  normalizeDependencyReviewResponse,
  normalizeGlobalAdvisory,
  type GitHubClient,
  type GitHubDependencyChange,
  type GitHubGlobalAdvisory,
} from "../../packages/github/src";
import type { TelegraphClient } from "../../packages/telegraph/src";
import type { SafeTelegraphRequestRecord } from "../../packages/ledger/src/types";
import { aggregateDecisions } from "./aggregate";
import type {
  ActionPullRequestContext,
  LimenRunResult,
  OrchestrateLimenRunInput,
} from "./types";

const SNAPSHOT_RETRY_DELAYS_MS = [250, 500] as const;
const SNAPSHOT_MAX_ATTEMPTS = SNAPSHOT_RETRY_DELAYS_MS.length + 1;
const TELEGRAPH_FAILURE_CODES = new Set([
  "TELEGRAPH_CHALLENGE_ERROR",
  "TELEGRAPH_PAYMENT_ERROR",
  "TELEGRAPH_ENGINE_ERROR",
  "TELEGRAPH_ROUTING_ERROR",
  "TELEGRAPH_RESPONSE_ERROR",
  "TELEGRAPH_NORMALIZATION_ERROR",
  "UNEXPECTED_NETWORK",
]);

export function createLimenRunId(): string {
  return `LM-${randomUUID()}`;
}

function isSnapshotWarning(error: unknown): error is GitHubDependencySnapshotWarningError {
  return error instanceof GitHubDependencySnapshotWarningError;
}

export async function compareDependencyReviewWithRetry(
  githubClient: GitHubClient,
  context: ActionPullRequestContext,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  observer?: {
    logger: LimenObservabilityLogger;
    correlation: LimenCorrelationContext;
    now: () => Date;
    onAttempt?: (attempt: number) => void;
  },
): Promise<GitHubDependencyChange[]> {
  let lastWarning: GitHubDependencySnapshotWarningError | undefined;
  for (let attempt = 0; attempt < SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    observer?.onAttempt?.(attempt + 1);
    try {
      const response = await githubClient.compareDependencies({
        owner: context.owner,
        repo: context.repo,
        base: context.baseSha,
        head: context.headSha,
        baseRevisionType: "sha",
        headRevisionType: "sha",
      });
      return normalizeDependencyReviewResponse(response.data);
    } catch (error) {
      if (!isSnapshotWarning(error)) {
        throw error;
      }
      lastWarning = error;
      const delay = SNAPSHOT_RETRY_DELAYS_MS[attempt];
      observer?.logger.emit({
        timestamp: observer.now().toISOString(),
        level: "warning",
        event: "FAILURE",
        stage: "dependency-review",
        ...observer.correlation,
        ...observabilityErrorFields(error),
        attempt: attempt + 1,
        maxAttempts: SNAPSHOT_MAX_ATTEMPTS,
        retryCount: attempt,
        outcome: delay === undefined ? "failed" : "retrying",
      });
      if (delay === undefined) {
        break;
      }
      await sleep(delay);
    }
  }

  throw lastWarning ?? new GitHubDependencySnapshotWarningError(
    "GitHub dependency snapshot remained unavailable after bounded retries.",
  );
}

function telegraphFailureInput(error: unknown): Extract<TelegraphEvidenceInput, { status: "failed" }> {
  if (isLimenError(error) && TELEGRAPH_FAILURE_CODES.has(error.code)) {
    return { status: "failed", code: error.code as TelegraphFailureCode };
  }
  return { status: "failed", code: "UNKNOWN_ERROR" };
}

function severityRank(severity: string | null): number {
  switch (severity) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEvidence(left: RepositoryExposureEvidence, right: RepositoryExposureEvidence): number {
  const packageOrder = compareStrings(left.packageName, right.packageName);
  if (packageOrder !== 0) {
    return packageOrder;
  }
  return compareStrings(left.ecosystem, right.ecosystem);
}

function uniqueReviewReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function createRunResult(
  context: ActionPullRequestContext,
  policy: LimenPolicy,
  values: Pick<LimenRunResult, "runId" | "decisions" | "evaluatedCves" | "skippedCves" | "telegraphRequestCount" | "telegraphCostUsd" | "telegraphCostKnown" | "telegraphRequests" | "budgetExceeded" | "missingCveCount" | "runReasons" | "evaluatedAt" | "startedAt" | "completedAt">,
): LimenRunResult {
  const aggregate = aggregateDecisions(values.decisions, {
    budgetExceeded: values.budgetExceeded,
    runReasons: values.runReasons,
    noRelevantVulnerabilities:
      values.decisions.length === 0 &&
      values.evaluatedCves.length === 0 &&
      values.skippedCves.length === 0 &&
      values.missingCveCount === 0 &&
      values.runReasons.length === 0,
  });

  return {
    ...values,
    ...aggregate,
    policyVersion: policy.version,
    baseSha: context.baseSha,
    headSha: context.headSha,
    pullRequestNumber: context.pullRequestNumber,
    context,
  };
}

async function normalizeAdvisory(
  githubClient: GitHubClient,
  ghsaId: string,
  cache: Map<string, Promise<GitHubGlobalAdvisory | null>>,
): Promise<GitHubGlobalAdvisory | null> {
  const normalizedGhsaId = ghsaId.trim().toUpperCase();
  const cached = cache.get(normalizedGhsaId);
  if (cached !== undefined) {
    return cached;
  }

  const request = githubClient.getGlobalAdvisory({ ghsaId: normalizedGhsaId })
    .then((response) => normalizeGlobalAdvisory(response.data))
    .catch((error: unknown) => {
      if (error instanceof GitHubAdvisoryNotFoundError) {
        return null;
      }
      throw error;
    });
  cache.set(normalizedGhsaId, request);
  return request;
}

function sortedCveGroups(
  evidence: NonNullable<ReturnType<typeof normalizeDependencyReviewEvidence>[number]["repositoryEvidence"]>[],
): [string, NonNullable<ReturnType<typeof normalizeDependencyReviewEvidence>[number]["repositoryEvidence"]>[]][] {
  const grouped = new Map<string, NonNullable<ReturnType<typeof normalizeDependencyReviewEvidence>[number]["repositoryEvidence"]>[]>();
  for (const record of evidence) {
    const current = grouped.get(record.cveId) ?? [];
    current.push(record);
    grouped.set(record.cveId, current);
  }

  return [...grouped.entries()].sort(([leftCve, leftRecords], [rightCve, rightRecords]) => {
    const leftPriority = Math.max(...leftRecords.map((record) => severityRank(record.severity)));
    const rightPriority = Math.max(...rightRecords.map((record) => severityRank(record.severity)));
    return rightPriority - leftPriority || compareStrings(leftCve, rightCve);
  });
}

function asTelegraphClient(
  factory: (() => TelegraphClient) | undefined,
  hasRelevantCves: boolean,
): TelegraphClient | undefined {
  return hasRelevantCves && factory !== undefined ? factory() : undefined;
}

export async function orchestrateLimenRun(
  input: OrchestrateLimenRunInput,
): Promise<LimenRunResult> {
  const now = input.dependencies.now ?? (() => new Date());
  const runId = input.dependencies.createRunId?.() ?? createLimenRunId();
  const startedAt = now().toISOString();
  const evaluatedAt = startedAt;
  const sleep = input.dependencies.sleep;
  const correlation: LimenCorrelationContext = {
    limenRunId: runId,
    githubRunId: input.context.githubRunId,
    githubRunAttempt: input.context.githubRunAttempt,
    repository: input.context.repository,
    pullRequestNumber: input.context.pullRequestNumber,
    baseSha: input.context.baseSha,
    headSha: input.context.headSha,
    policyVersion: input.policy.version,
  };

  let changes: GitHubDependencyChange[];
  let dependencyReviewAttempts = 0;
  const dependencyStage = startObservabilityStage(
    input.dependencies.observability,
    "dependency-review",
    correlation,
    now,
    { maxAttempts: SNAPSHOT_MAX_ATTEMPTS },
  );
  try {
    changes = await compareDependencyReviewWithRetry(
      input.dependencies.githubClient,
      input.context,
      sleep,
      input.dependencies.observability === undefined
        ? undefined
        : {
            logger: input.dependencies.observability,
            correlation,
            now,
            onAttempt: (attempt) => { dependencyReviewAttempts = attempt; },
          },
    );
    dependencyStage.success({
      attempt: dependencyReviewAttempts,
      maxAttempts: SNAPSHOT_MAX_ATTEMPTS,
      retryCount: Math.max(0, dependencyReviewAttempts - 1),
    });
  } catch (error) {
    dependencyStage.failure(error, {
      attempt: dependencyReviewAttempts || SNAPSHOT_MAX_ATTEMPTS,
      maxAttempts: SNAPSHOT_MAX_ATTEMPTS,
      retryCount: Math.max(0, (dependencyReviewAttempts || SNAPSHOT_MAX_ATTEMPTS) - 1),
    });
    if (isSnapshotWarning(error)) {
      const aggregateStage = startObservabilityStage(
        input.dependencies.observability,
        "aggregate-decision",
        correlation,
        now,
      );
      const result = createRunResult(input.context, input.policy, {
        runId,
        decisions: [],
        evaluatedCves: [],
        skippedCves: [],
        telegraphRequestCount: 0,
        telegraphCostUsd: 0,
        telegraphCostKnown: true,
        telegraphRequests: [],
        budgetExceeded: false,
        missingCveCount: 0,
        runReasons: ["DEPENDENCY_SNAPSHOT_UNAVAILABLE"],
        evaluatedAt,
        startedAt,
        completedAt: now().toISOString(),
      });
      aggregateStage.success({
        outcome: result.overallDecision.toLowerCase() as "pass" | "hold" | "review",
        reasonCode: result.runReasonCode,
      });
      return result;
    }
    throw error;
  }

  const advisoryCache = new Map<string, Promise<GitHubGlobalAdvisory | null>>();
  const repositoryEvidence: NonNullable<ReturnType<typeof normalizeDependencyReviewEvidence>[number]["repositoryEvidence"]>[] = [];
  const runReasons: string[] = [];
  let missingCveCount = 0;

  const advisoryStage = startObservabilityStage(
    input.dependencies.observability,
    "advisory-enrichment",
    correlation,
    now,
  );
  try {
    for (const change of changes) {
      if (change.changeType === "removed" || change.vulnerabilities.length === 0) {
        continue;
      }

      for (const vulnerability of change.vulnerabilities) {
        let advisory: GitHubGlobalAdvisory | null = null;
        try {
          if (vulnerability.advisoryGhsaId !== null) {
            advisory = await normalizeAdvisory(
              input.dependencies.githubClient,
              vulnerability.advisoryGhsaId,
              advisoryCache,
            );
          }

          const normalizedResults = normalizeDependencyReviewEvidence({
            change: { ...change, vulnerabilities: [vulnerability] },
            advisory,
            context: {
              repository: input.context.repository,
              commitSha: input.context.headSha,
              pullRequestNumber: input.context.pullRequestNumber,
            },
          });
          for (const result of normalizedResults) {
            if (result.repositoryEvidence !== null) {
              repositoryEvidence.push(result.repositoryEvidence);
            } else if (result.status === "missing-cve") {
              missingCveCount += 1;
            } else if (result.status === "inactive") {
              runReasons.push("DEPENDENCY_REVIEW_CHANGE_UNCERTAIN");
            }
          }
        } catch (error) {
          if (error instanceof GitHubEvidenceConflictError) {
            runReasons.push("GITHUB_EVIDENCE_CONFLICT");
            continue;
          }
          throw error;
        }
      }
    }
    advisoryStage.success({
      outcome: runReasons.includes("GITHUB_EVIDENCE_CONFLICT") ? "partial" : "success",
      requestCount: repositoryEvidence.length,
    });
  } catch (error) {
    advisoryStage.failure(error);
    throw error;
  }

  if (missingCveCount > 0) {
    runReasons.push("CVE_IDENTITY_UNAVAILABLE");
  }

  const selectionStage = startObservabilityStage(
    input.dependencies.observability,
    "finding-selection",
    correlation,
    now,
  );
  const groups = sortedCveGroups(repositoryEvidence);
  const selectedGroups = groups.slice(0, input.maxLookups);
  const skippedCves = groups.slice(input.maxLookups).map(([cveId]) => cveId);
  const budgetExceeded = skippedCves.length > 0;
  const evaluatedCves = selectedGroups.map(([cveId]) => cveId);
  selectionStage.success({
    requestCount: selectedGroups.length,
    outcome: budgetExceeded ? "partial" : "success",
    ...(budgetExceeded ? { reasonCode: "LOOKUP_BUDGET_EXCEEDED" } : {}),
  });

  const telegraphInitializationStage = startObservabilityStage(
    input.dependencies.observability,
    "telegraph-initialization",
    correlation,
    now,
  );
  let telegraphClient: TelegraphClient | undefined;
  try {
    telegraphClient = asTelegraphClient(
      input.dependencies.telegraphClientFactory,
      selectedGroups.length > 0,
    );
    telegraphInitializationStage.success({
      outcome: selectedGroups.length === 0 ? "skipped" : "success",
      requestCount: selectedGroups.length,
    });
  } catch (error) {
    telegraphInitializationStage.failure(error);
    throw error;
  }
  const telegraphCache = new Map<string, TelegraphEvidenceInput>();
  const decisions = [] as LimenRunResult["decisions"];
  const telegraphRequests = [] as SafeTelegraphRequestRecord[];
  let telegraphRequestCount = 0;
  let telegraphCostUsd = 0;
  let telegraphCostKnown = true;

  const decisionStage = startObservabilityStage(
    input.dependencies.observability,
    "decision-evaluation",
    correlation,
    now,
  );
  try {
    for (const [cveId, records] of selectedGroups) {
      const firstRecord = [...records].sort(compareEvidence)[0];
      if (firstRecord === undefined) {
        continue;
      }

      let telegraphEvidence = telegraphCache.get(cveId);
      if (telegraphEvidence === undefined) {
        if (telegraphClient === undefined) {
          telegraphEvidence = { status: "failed", code: "TELEGRAPH_PAYMENT_ERROR" };
          const unavailableStage = startObservabilityStage(
            input.dependencies.observability,
            "telegraph-cve-lookup",
            correlation,
            now,
            { cve: cveId, intent: "CVE_LOOKUP", costUsd: null },
          );
          unavailableStage.failure(undefined, {
            cve: cveId,
            errorCode: "TELEGRAPH_PAYMENT_ERROR",
          });
        } else {
          telegraphRequestCount += 1;
          const requestIndex = telegraphRequestCount;
          const lookupStage = startObservabilityStage(
            input.dependencies.observability,
            "telegraph-cve-lookup",
            correlation,
            now,
            {
              cve: cveId,
              intent: "CVE_LOOKUP",
              costUsd: null,
              requestIndex,
              attempt: 1,
              maxAttempts: 1,
            },
          );
          const requestedAt = now().toISOString();
          try {
            const evidence: TelegraphCveEvidence = await telegraphClient.lookupCve({
              cveId,
              packageName: firstRecord.packageName,
              installedVersion: firstRecord.installedVersion ?? undefined,
              repository: firstRecord.repository,
            });
            telegraphEvidence = { status: "available", evidence };
            if (evidence.costUsd !== null && Number.isFinite(evidence.costUsd) && evidence.costUsd >= 0) {
              telegraphCostUsd += evidence.costUsd;
            } else {
              telegraphCostKnown = false;
            }
            lookupStage.success({
              cve: cveId,
              intent: evidence.intent,
              ...(evidence.minerName === null ? {} : { minerName: evidence.minerName }),
              costUsd: evidence.costUsd,
              providerDurationMs: evidence.durationMs,
              ...(evidence.network === null ? {} : { network: evidence.network }),
              ...(evidence.paymentScheme === null ? {} : { paymentScheme: evidence.paymentScheme }),
              ...(evidence.requestedAt === null ? {} : { requestedAt: evidence.requestedAt }),
              ...(evidence.receivedAt === null ? {} : { receivedAt: evidence.receivedAt }),
            });
            telegraphRequests.push({
              cveId,
              intent: "CVE_LOOKUP",
              minerId: evidence.minerId,
              minerName: evidence.minerName,
              costUsd: evidence.costUsd,
              durationMs: evidence.durationMs,
              network: evidence.network,
              paymentScheme: evidence.paymentScheme,
              requestedAt: evidence.requestedAt,
              receivedAt: evidence.receivedAt,
              outcome: "success",
              settlementReference: null,
            });
          } catch (error) {
            const failure = telegraphFailureInput(error);
            telegraphEvidence = failure;
            telegraphCostKnown = false;
            lookupStage.failure(error, {
              cve: cveId,
              errorCode: failure.code,
            });
            telegraphRequests.push({
              cveId,
              intent: "CVE_LOOKUP",
              minerId: null,
              minerName: null,
              costUsd: null,
              durationMs: null,
              network: null,
              paymentScheme: null,
              requestedAt,
              receivedAt: now().toISOString(),
              outcome: "failed",
              settlementReference: null,
            });
          }
        }
        telegraphCache.set(cveId, telegraphEvidence);
      }

      for (const record of records.sort(compareEvidence)) {
        decisions.push(evaluateLimenDecision({
          id: `${runId}-${String(decisions.length + 1).padStart(4, "0")}`,
          evaluatedAt,
          repositoryEvidence: record,
          telegraphEvidence,
          policy: input.policy,
        }));
      }
    }
    decisionStage.success({ requestCount: decisions.length });
  } catch (error) {
    decisionStage.failure(error);
    throw error;
  }

  const aggregateStage = startObservabilityStage(
    input.dependencies.observability,
    "aggregate-decision",
    correlation,
    now,
  );
  const result = createRunResult(input.context, input.policy, {
    runId,
    decisions,
    evaluatedCves,
    skippedCves,
    telegraphRequestCount,
    telegraphCostUsd,
    telegraphCostKnown,
    telegraphRequests,
    budgetExceeded,
    missingCveCount,
    runReasons: uniqueReviewReasons(runReasons),
    evaluatedAt,
    startedAt,
    completedAt: now().toISOString(),
  });
  aggregateStage.success({
    outcome: result.overallDecision.toLowerCase() as "pass" | "hold" | "review",
    reasonCode: result.runReasonCode,
    requestCount: result.decisions.length,
  });
  return result;
}
