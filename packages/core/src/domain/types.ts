export type Severity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL"
  | "UNKNOWN";

export type DependencyScope = "runtime" | "development" | "unknown";

export type DependencyRelationship =
  | "direct"
  | "transitive"
  | "unknown";

export type RepositoryExposureState =
  | "affected"
  | "patched"
  | "not_affected"
  | "unknown";

export interface RepositoryExposureEvidence {
  repository?: string;
  commitSha?: string;
  pullRequestNumber?: number;

  packageName: string;
  ecosystem: string;

  installedVersion: string | null;
  vulnerableRange: string | null;
  firstPatchedVersion: string | null;

  cveId: string;

  severity: Severity | null;
  cvssScore: number | null;

  manifestPath: string | null;

  scope: DependencyScope;
  relationship: DependencyRelationship;
  exposureState: RepositoryExposureState;

  source: string;
}

export interface TelegraphCveEvidence {
  cveId: string | null;

  severity: Severity | null;
  cvssScore: number | null;
  description: string | null;
  references: string[];

  affectedVersions: string[] | null;
  fixedVersions: string[] | null;
  fixAvailable: boolean | null;

  intent: "CVE_LOOKUP";

  minerId: string | null;
  minerName: string | null;

  timestamp: string | null;
  reasoning: string | null;
  endpoint: string | null;

  costUsd: number | null;
  durationMs: number | null;

  network: string | null;
  paymentScheme: string | null;

  requestedAt: string;
  receivedAt: string | null;

  raw: unknown;
}

export type TelegraphFailureCode =
  | "TELEGRAPH_CHALLENGE_ERROR"
  | "TELEGRAPH_PAYMENT_ERROR"
  | "TELEGRAPH_ENGINE_ERROR"
  | "TELEGRAPH_ROUTING_ERROR"
  | "TELEGRAPH_RESPONSE_ERROR"
  | "TELEGRAPH_NORMALIZATION_ERROR"
  | "UNEXPECTED_NETWORK"
  | "UNKNOWN_ERROR";

export interface TelegraphEvidenceAvailable {
  status: "available";
  evidence: TelegraphCveEvidence;
}

export interface TelegraphEvidenceFailure {
  status: "failed";
  code: TelegraphFailureCode;
}

export type TelegraphEvidenceInput =
  | TelegraphEvidenceAvailable
  | TelegraphEvidenceFailure;

export type LimenPolicyUncertaintyAction = "review";

export interface LimenPolicy {
  version: string;
  blockedSeverities: Exclude<Severity, "UNKNOWN">[];
  dependencyScopes: Exclude<DependencyScope, "unknown">[];
  missingExternalEvidence: LimenPolicyUncertaintyAction;
  severityConflict: LimenPolicyUncertaintyAction;
  cveIdentityConflict: LimenPolicyUncertaintyAction;
  telegraphFailure: LimenPolicyUncertaintyAction;
  unknownExposure: LimenPolicyUncertaintyAction;
}

export type LimenDecision = "PASS" | "HOLD" | "REVIEW";

export type LimenReasonCode =
  | "AFFECTED_BLOCKING_DEPENDENCY"
  | "NO_BLOCKING_CONDITION"
  | "TELEGRAPH_UNAVAILABLE"
  | "EXTERNAL_EVIDENCE_INCOMPLETE"
  | "CVE_IDENTITY_CONFLICT"
  | "SEVERITY_CONFLICT"
  | "SEVERITY_UNKNOWN"
  | "EXPOSURE_UNKNOWN"
  | "DEPENDENCY_SCOPE_UNKNOWN";

export type DecisionCheckOutcome = "pass" | "fail" | "unknown";

export interface DecisionCheck {
  id: string;
  label: string;
  outcome: DecisionCheckOutcome;
  evidence?: string;
}

export interface LimenDecisionResult {
  id: string;
  decision: LimenDecision;
  reasonCode: LimenReasonCode;
  summary: string;
  cveId: string;
  repositoryEvidence: RepositoryExposureEvidence;
  telegraphEvidence: TelegraphCveEvidence | null;
  checks: DecisionCheck[];
  evaluatedAt: string;
  policyVersion: string;
}

export interface LimenDecisionInput {
  id: string;
  evaluatedAt: string;
  repositoryEvidence: RepositoryExposureEvidence;
  telegraphEvidence: TelegraphEvidenceInput;
  policy: LimenPolicy;
}

export function normalizeSeverity(value: unknown): Severity {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "LOW" ||
    normalized === "MEDIUM" ||
    normalized === "HIGH" ||
    normalized === "CRITICAL"
  ) {
    return normalized;
  }

  return "UNKNOWN";
}
