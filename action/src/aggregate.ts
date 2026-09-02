import type { LimenDecisionResult } from "../../packages/core/src";

export interface AggregateOptions {
  budgetExceeded: boolean;
  runReasons: string[];
  noRelevantVulnerabilities: boolean;
}

export interface AggregateResult {
  overallDecision: "PASS" | "HOLD" | "REVIEW";
  runReasonCode: string;
  runSummary: string;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

export function aggregateDecisions(
  decisions: LimenDecisionResult[],
  options: AggregateOptions,
): AggregateResult {
  const hold = decisions.find((decision) => decision.decision === "HOLD");
  if (hold !== undefined) {
    return {
      overallDecision: "HOLD",
      runReasonCode: hold.reasonCode,
      runSummary: "Evidence is sufficient and the active policy blocks at least one dependency.",
    };
  }

  const review = decisions.find((decision) => decision.decision === "REVIEW");
  const reasons = uniqueReasons(options.runReasons);
  if (review !== undefined) {
    return {
      overallDecision: "REVIEW",
      runReasonCode: review.reasonCode,
      runSummary: "Human review is required because at least one evidence-backed decision is incomplete or unavailable.",
    };
  }
  if (options.budgetExceeded) {
    return {
      overallDecision: "REVIEW",
      runReasonCode: "LOOKUP_BUDGET_EXCEEDED",
      runSummary: "Human review is required because the paid CVE lookup budget left relevant findings unevaluated.",
    };
  }
  if (reasons.length > 0) {
    return {
      overallDecision: "REVIEW",
      runReasonCode: reasons[0],
      runSummary: "Human review is required because Limen could not establish sufficient evidence to authorize this release.",
    };
  }
  if (options.noRelevantVulnerabilities) {
    return {
      overallDecision: "PASS",
      runReasonCode: "NO_RELEVANT_VULNERABILITY",
      runSummary: "No blocking dependency vulnerability was introduced by this pull request.",
    };
  }

  return {
    overallDecision: "PASS",
    runReasonCode: "NO_BLOCKING_CONDITION",
    runSummary: "All evaluated relevant findings support proceeding under the active policy.",
  };
}
