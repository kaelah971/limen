import { randomUUID } from "node:crypto";
import {
  evaluateLimenDecision,
  isLimenError,
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
import { aggregateDecisions } from "./aggregate";
import type {
  ActionPullRequestContext,
  LimenRunResult,
  OrchestrateLimenRunInput,
} from "./types";

const SNAPSHOT_RETRY_DELAYS_MS = [250, 500] as const;
const TELEGRAPH_FAILURE_CODES = new Set([
  "TELEGRAPH_CHALLENGE_ERROR",
  "TELEGRAPH_PAYMENT_ERROR",
  "TELEGRAPH_ENGINE_ERROR",
  "TELEGRAPH_ROUTING_ERROR",
  "TELEGRAPH_RESPONSE_ERROR",
  "TELEGRAPH_NORMALIZATION_ERROR",
  "UNEXPECTED_NETWORK",
]);

function isSnapshotWarning(error: unknown): error is GitHubDependencySnapshotWarningError {
  return error instanceof GitHubDependencySnapshotWarningError;
}

export async function compareDependencyReviewWithRetry(
  githubClient: GitHubClient,
  context: ActionPullRequestContext,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<GitHubDependencyChange[]> {
  let lastWarning: GitHubDependencySnapshotWarningError | undefined;
  for (let attempt = 0; attempt < SNAPSHOT_RETRY_DELAYS_MS.length + 1; attempt += 1) {
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

function telegraphFailureInput(error: unknown): TelegraphEvidenceInput {
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
  values: Pick<LimenRunResult, "runId" | "decisions" | "evaluatedCves" | "skippedCves" | "telegraphRequestCount" | "telegraphCostUsd" | "budgetExceeded" | "missingCveCount" | "runReasons" | "evaluatedAt">,
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
  const runId = input.dependencies.createRunId?.() ?? `LM-${randomUUID()}`;
  const evaluatedAt = now().toISOString();
  const sleep = input.dependencies.sleep;

  let changes: GitHubDependencyChange[];
  try {
    changes = await compareDependencyReviewWithRetry(
      input.dependencies.githubClient,
      input.context,
      sleep,
    );
  } catch (error) {
    if (isSnapshotWarning(error)) {
      return createRunResult(input.context, input.policy, {
        runId,
        decisions: [],
        evaluatedCves: [],
        skippedCves: [],
        telegraphRequestCount: 0,
        telegraphCostUsd: 0,
        budgetExceeded: false,
        missingCveCount: 0,
        runReasons: ["DEPENDENCY_SNAPSHOT_UNAVAILABLE"],
        evaluatedAt,
      });
    }
    throw error;
  }

  const advisoryCache = new Map<string, Promise<GitHubGlobalAdvisory | null>>();
  const repositoryEvidence: NonNullable<ReturnType<typeof normalizeDependencyReviewEvidence>[number]["repositoryEvidence"]>[] = [];
  const runReasons: string[] = [];
  let missingCveCount = 0;

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

  if (missingCveCount > 0) {
    runReasons.push("CVE_IDENTITY_UNAVAILABLE");
  }

  const groups = sortedCveGroups(repositoryEvidence);
  const selectedGroups = groups.slice(0, input.maxLookups);
  const skippedCves = groups.slice(input.maxLookups).map(([cveId]) => cveId);
  const budgetExceeded = skippedCves.length > 0;
  const evaluatedCves = selectedGroups.map(([cveId]) => cveId);
  const telegraphClient = asTelegraphClient(
    input.dependencies.telegraphClientFactory,
    selectedGroups.length > 0,
  );
  const telegraphCache = new Map<string, TelegraphEvidenceInput>();
  const decisions = [] as LimenRunResult["decisions"];
  let telegraphRequestCount = 0;
  let telegraphCostUsd = 0;

  for (const [cveId, records] of selectedGroups) {
    const firstRecord = [...records].sort(compareEvidence)[0];
    if (firstRecord === undefined) {
      continue;
    }

    let telegraphEvidence = telegraphCache.get(cveId);
    if (telegraphEvidence === undefined) {
      if (telegraphClient === undefined) {
        telegraphEvidence = { status: "failed", code: "TELEGRAPH_PAYMENT_ERROR" };
      } else {
        telegraphRequestCount += 1;
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
          }
        } catch (error) {
          telegraphEvidence = telegraphFailureInput(error);
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

  return createRunResult(input.context, input.policy, {
    runId,
    decisions,
    evaluatedCves,
    skippedCves,
    telegraphRequestCount,
    telegraphCostUsd,
    budgetExceeded,
    missingCveCount,
    runReasons: uniqueReviewReasons(runReasons),
    evaluatedAt,
  });
}
