import type {
  LedgerRunIngest,
  LedgerUsageClass,
} from "../../packages/ledger/src/types";
import type { LimenRunResult } from "./types";

export function buildLedgerRunIngest(
  result: LimenRunResult,
  usageClass: LedgerUsageClass,
): LedgerRunIngest | null {
  const { githubRunId, githubRunAttempt } = result.context;
  if (githubRunId === undefined || githubRunAttempt === undefined) {
    return null;
  }

  const decisionCounts = {
    PASS: result.decisions.filter((decision) => decision.decision === "PASS").length,
    HOLD: result.decisions.filter((decision) => decision.decision === "HOLD").length,
    REVIEW: result.decisions.filter((decision) => decision.decision === "REVIEW").length,
  };

  return {
    run: {
      repository: result.context.repository,
      pullRequestNumber: result.pullRequestNumber,
      baseSha: result.baseSha,
      headSha: result.headSha,
      githubRunId,
      githubRunAttempt,
      githubEvent: result.context.eventName,
      actor: result.context.actor,
      policyVersion: result.policyVersion,
      overallDecision: result.overallDecision,
      runReasonCode: result.runReasonCode,
      runSummary: result.runSummary,
      decisionCount: decisionCounts.PASS + decisionCounts.HOLD + decisionCounts.REVIEW,
      passCount: decisionCounts.PASS,
      holdCount: decisionCounts.HOLD,
      reviewCount: decisionCounts.REVIEW,
      telegraphRequestCount: result.telegraphRequests.length,
      telegraphCostUsd: result.telegraphCostUsd,
      evaluatedCves: result.evaluatedCves,
      skippedCves: result.skippedCves,
      isTest: usageClass !== "production",
      usageClass,
      source: "action",
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    },
    decisions: result.decisions,
    telegraphRequests: result.telegraphRequests,
  };
}
