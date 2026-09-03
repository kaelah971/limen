import {
  redactSecrets,
  type LimenDecisionResult,
  type RepositoryExposureEvidence,
  type TelegraphCveEvidence,
} from "../../core/src";
import {
  validatePersistedRunDetail,
  type PersistedRunDetail,
  type SafeTelegraphRequestRecord,
} from "../../ledger/src";
import { ReceiptSnapshotSchema } from "./schemas";
import { RECEIPT_SCHEMA_VERSION } from "./types";
import type {
  PublicReceiptCheck,
  PublicReceiptDecision,
  PublicReceiptRelease,
  PublicReceiptRepositoryEvidence,
  PublicReceiptTelegraphEvidence,
  PublicReceiptTelegraphRequest,
  ReceiptSnapshot,
} from "./types";

function projectRepositoryEvidence(
  evidence: RepositoryExposureEvidence,
): PublicReceiptRepositoryEvidence {
  return {
    packageName: evidence.packageName,
    ecosystem: evidence.ecosystem,
    installedVersion: evidence.installedVersion,
    vulnerableRange: evidence.vulnerableRange,
    firstPatchedVersion: evidence.firstPatchedVersion,
    cveId: evidence.cveId,
    severity: evidence.severity,
    cvssScore: evidence.cvssScore,
    manifestPath: evidence.manifestPath,
    scope: evidence.scope,
    relationship: evidence.relationship,
    exposureState: evidence.exposureState,
    source: evidence.source,
  };
}

function projectTelegraphEvidence(
  evidence: TelegraphCveEvidence | null,
): PublicReceiptTelegraphEvidence | null {
  if (evidence === null) {
    return null;
  }

  return {
    cveId: evidence.cveId,
    severity: evidence.severity,
    cvssScore: evidence.cvssScore,
    description: evidence.description,
    references: evidence.references,
    affectedVersions: evidence.affectedVersions,
    fixedVersions: evidence.fixedVersions,
    fixAvailable: evidence.fixAvailable,
    intent: evidence.intent,
    minerName: evidence.minerName,
    timestamp: evidence.timestamp,
    reasoning: evidence.reasoning,
    costUsd: evidence.costUsd,
    durationMs: evidence.durationMs,
    network: evidence.network,
    paymentScheme: evidence.paymentScheme,
    requestedAt: evidence.requestedAt,
    receivedAt: evidence.receivedAt,
  };
}

function projectChecks(
  checks: LimenDecisionResult["checks"],
): PublicReceiptCheck[] {
  return checks.map((check) => {
    const projected: PublicReceiptCheck = {
      label: check.label,
      outcome: check.outcome,
    };
    if (check.evidence !== undefined) {
      projected.evidence = check.evidence;
    }
    return projected;
  });
}

function projectDecision(decision: LimenDecisionResult): PublicReceiptDecision {
  return {
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    summary: decision.summary,
    cveId: decision.cveId,
    repositoryEvidence: projectRepositoryEvidence(decision.repositoryEvidence),
    telegraphEvidence: projectTelegraphEvidence(decision.telegraphEvidence),
    checks: projectChecks(decision.checks),
    evaluatedAt: decision.evaluatedAt,
    policyVersion: decision.policyVersion,
  };
}

function projectTelegraphRequest(
  request: SafeTelegraphRequestRecord,
): PublicReceiptTelegraphRequest {
  return {
    cveId: request.cveId,
    intent: request.intent,
    minerName: request.minerName,
    costUsd: request.costUsd,
    durationMs: request.durationMs,
    network: request.network,
    paymentScheme: request.paymentScheme,
    requestedAt: request.requestedAt,
    receivedAt: request.receivedAt,
    outcome: request.outcome,
  };
}

export function projectReceiptSnapshot(detail: PersistedRunDetail): ReceiptSnapshot {
  const validated = validatePersistedRunDetail(detail);
  const release: PublicReceiptRelease = {
    repository: validated.run.repository,
    pullRequestNumber: validated.run.pullRequestNumber,
    baseSha: validated.run.baseSha,
    headSha: validated.run.headSha,
    githubEvent: validated.run.githubEvent,
    actor: validated.run.actor,
    policyVersion: validated.run.policyVersion,
    overallDecision: validated.run.overallDecision,
    runReasonCode: validated.run.runReasonCode,
    runSummary: validated.run.runSummary,
    decisionCount: validated.run.decisionCount,
    passCount: validated.run.passCount,
    holdCount: validated.run.holdCount,
    reviewCount: validated.run.reviewCount,
    telegraphRequestCount: validated.run.telegraphRequestCount,
    telegraphCostUsd: validated.run.telegraphCostUsd,
    evaluatedCves: validated.run.evaluatedCves,
    skippedCves: validated.run.skippedCves,
    usageClass: validated.run.usageClass,
    source: validated.run.source,
    startedAt: validated.run.startedAt,
    completedAt: validated.run.completedAt,
  };
  const snapshot = ReceiptSnapshotSchema.parse(redactSecrets({
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    release,
    decisions: validated.decisions.map(projectDecision),
    telegraphRequests: validated.telegraphRequests.map(projectTelegraphRequest),
  }));
  return snapshot;
}
