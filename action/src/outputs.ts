import * as actionsCore from "@actions/core";
import type { LimenRunResult } from "./types";

export interface ActionOutputWriter {
  setOutput(name: string, value: string): void;
}

export function setActionOutputs(
  result: LimenRunResult,
  writer: ActionOutputWriter = actionsCore,
): void {
  const passCount = result.decisions.filter((decision) => decision.decision === "PASS").length;
  const holdCount = result.decisions.filter((decision) => decision.decision === "HOLD").length;
  const reviewCount = result.decisions.filter((decision) => decision.decision === "REVIEW").length;
  const outputs: Record<string, string> = {
    decision: result.overallDecision,
    "run-id": result.runId,
    "policy-version": result.policyVersion,
    "decision-count": String(result.decisions.length),
    "pass-count": String(passCount),
    "hold-count": String(holdCount),
    "review-count": String(reviewCount),
    "evaluated-cves": JSON.stringify(result.evaluatedCves),
    "skipped-cves": JSON.stringify(result.skippedCves),
    "telegraph-request-count": String(result.telegraphRequestCount),
    "telegraph-cost-usd": result.telegraphCostUsd.toFixed(6),
    reason: result.runReasonCode,
    "ledger-run-id": result.ledgerRunId ?? "",
    "ledger-persisted": result.ledgerPersisted === true ? "true" : "false",
  };

  for (const [name, value] of Object.entries(outputs)) {
    writer.setOutput(name, value);
  }
}
