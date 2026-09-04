import { redactString } from "../../packages/core/src";
import type {
  LimenDecisionResult,
  LimenObservabilityEvent,
} from "../../packages/core/src";
import type { LimenRunResult } from "./types";

function safe(value: unknown): string {
  return redactString(String(value ?? "not provided"))
    .replace(/[|`\r\n]/g, " ")
    .trim();
}

function telegraphLabel(decision: LimenDecisionResult): string {
  if (decision.telegraphEvidence === null) {
    const availability = decision.checks.find((check) => check.id === "telegraph-availability");
    return safe(availability?.evidence ?? "Unavailable");
  }
  const evidence = decision.telegraphEvidence;
  const severity = evidence.severity ?? "UNKNOWN";
  const miner = evidence.minerName ?? evidence.minerId ?? "Miner unavailable";
  return `${safe(severity)} / ${safe(miner)}`;
}

function formatCost(value: number | null): string {
  return value === null ? "not reported" : `$${value.toFixed(6)}`;
}

function shortSha(value: string): string {
  return value.slice(0, 12);
}

function stageSummary(events: readonly LimenObservabilityEvent[]): string {
  const terminal = new Map<string, LimenObservabilityEvent>();
  for (const event of events) {
    if (event.event === "START") {
      continue;
    }
    if (event.event === "FAILURE" && event.outcome === "retrying") {
      continue;
    }
    terminal.set(event.stage, event);
  }

  const rows = [...terminal.values()].map((event) => {
    const retry = event.retryCount === undefined ? "-" : String(event.retryCount);
    const duration = event.durationMs === undefined ? "-" : `${event.durationMs} ms`;
    const status = event.event === "SUCCESS" ? "SUCCESS" : "FAILURE";
    return `| ${safe(event.stage)} | ${status} | ${duration} | ${retry} |`;
  });
  return rows.length === 0
    ? "No completed stage telemetry was recorded."
    : [
        "| Stage | Status | Duration | Retries |",
        "| --- | --- | --- | --- |",
        ...rows,
      ].join("\n");
}

function clientDuration(
  events: readonly LimenObservabilityEvent[],
  cve: string,
): string | null {
  const event = [...events].reverse().find((candidate) =>
    candidate.stage === "telegraph-cve-lookup" &&
    candidate.cve === cve &&
    candidate.event !== "START" &&
    candidate.outcome !== "retrying",
  );
  return event?.durationMs === undefined ? null : `${event.durationMs} ms`;
}

export function renderSummary(
  result: LimenRunResult,
  events: readonly LimenObservabilityEvent[] = [],
): string {
  const decisionRows = result.decisions.length === 0
    ? "No per-CVE decisions were generated."
    : [
        "| Package | Version | CVE | Scope | Relationship | GitHub severity | Vulnerable range | First patched | Telegraph | Limen |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ...result.decisions.map((decision) => {
          const repository = decision.repositoryEvidence;
          return `| ${safe(repository.packageName)} | ${safe(repository.installedVersion)} | ${safe(repository.cveId)} | ${safe(repository.scope)} | ${safe(repository.relationship)} | ${safe(repository.severity)} | ${safe(repository.vulnerableRange)} | ${safe(repository.firstPatchedVersion)} | ${telegraphLabel(decision)} | **${safe(decision.decision)}** |`;
        }),
      ].join("\n");

  const why = [
    `- ${safe(result.runSummary)}`,
    ...result.runReasons.map((reason) => `- Run reason: ${safe(reason)}.`),
    ...result.decisions.map((decision) =>
      `- ${safe(decision.cveId)}: ${safe(decision.summary)} (${safe(decision.reasonCode)})`,
    ),
    ...(result.missingCveCount > 0
      ? [`- ${result.missingCveCount} affected advisory result(s) had no usable CVE identity.`]
      : []),
    ...(result.budgetExceeded
      ? [`- Lookup budget exceeded. Skipped CVEs: ${safe(result.skippedCves.join(", "))}.`]
      : []),
  ].join("\n");

  const telegraph = result.decisions.length === 0
    ? "No paid Telegraph lookup was required."
    : result.decisions.map((decision) => {
        const evidence = decision.telegraphEvidence;
        if (evidence === null) {
          const availability = decision.checks.find((check) => check.id === "telegraph-availability");
          return `- ${safe(decision.cveId)}: unavailable (${safe(availability?.evidence ?? "no evidence")}).`;
        }
        const localDuration = clientDuration(events, decision.cveId);
        return `- ${safe(decision.cveId)}: Intent **CVE_LOOKUP**, Miner ${safe(evidence.minerName ?? evidence.minerId ?? "not reported")}, cost ${formatCost(evidence.costUsd)}, provider latency ${safe(evidence.durationMs === null ? "not reported" : `${evidence.durationMs} ms`)}${localDuration === null ? "" : `, client duration ${localDuration}`}.`;
      }).join("\n");

  const nextAction = result.overallDecision === "PASS"
    ? "Merge or continue the release under the recorded policy."
    : result.overallDecision === "HOLD"
      ? "Patch the dependency, investigate the finding, or deliberately change policy in a separate trusted change."
      : "Human review is required before this release can proceed. Inspect the evidence or rerun the check.";

  return `# Limen: ${result.overallDecision}

${safe(result.runSummary)}

Repository: \`${safe(result.context.repository)}\`<br>
PR: #${result.context.pullRequestNumber}<br>
Limen run: \`${safe(result.runId)}\`<br>
GitHub run: \`${safe(result.context.githubRunId)}\` / attempt \`${safe(result.context.githubRunAttempt)}\`<br>
Policy: \`${safe(result.policyVersion)}\`<br>
Base: \`${safe(shortSha(result.baseSha))}\`<br>
Head: \`${safe(shortSha(result.headSha))}\`<br>
Event: \`${safe(result.context.eventName)}\`<br>
Actor: \`${safe(result.context.actor)}\`

## Execution

${stageSummary(events)}

## Decisions

${decisionRows}

## Why

${why}

## Telegraph

Requests: \`${result.telegraphRequestCount}\`<br>
Cost: \`${result.telegraphCostKnown === false ? "not fully reported" : `$${result.telegraphCostUsd.toFixed(6)}`}\`

${telegraph}

## Evidence ledger

${result.ledgerStatus === "recorded"
  ? `Evidence ledger: recorded\nRun ID: \`${safe(result.ledgerRunId)}\`\nDuration: \`${safe(result.ledgerPersistenceDurationMs)} ms\``
  : result.ledgerStatus === "failed"
    ? `Evidence ledger: persistence failed\nError: \`${safe(result.ledgerErrorCode)}\`${result.ledgerHttpStatus === undefined ? "" : ` (HTTP ${result.ledgerHttpStatus})`}\nDuration: \`${safe(result.ledgerPersistenceDurationMs)} ms\``
    : result.ledgerStatus === "partial"
      ? "Evidence ledger: partial configuration; persistence skipped"
    : "Evidence ledger: not configured"}

## State

- **HOLD:** evidence is sufficient; policy says stop.
- **REVIEW:** evidence is insufficient, conflicting, or unavailable; human investigation is required.
- **PASS:** available evidence supports proceeding under policy; it is not a universal security guarantee.

## Next action

${nextAction}
`;
}
