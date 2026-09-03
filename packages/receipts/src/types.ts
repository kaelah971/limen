
export const RECEIPT_SCHEMA_VERSION = "limen.receipt.v1" as const;

export type ReceiptSchemaVersion = typeof RECEIPT_SCHEMA_VERSION;
export type ReceiptId = string;
export type LedgerRunId = string;

export interface PublicReceiptRepositoryEvidence {
  packageName: string;
  ecosystem: string;
  installedVersion: string | null;
  vulnerableRange: string | null;
  firstPatchedVersion: string | null;
  cveId: string;
  severity: string | null;
  cvssScore: number | null;
  manifestPath: string | null;
  scope: string;
  relationship: string;
  exposureState: string;
  source: string;
}

export interface PublicReceiptTelegraphEvidence {
  cveId: string | null;
  severity: string | null;
  cvssScore: number | null;
  description: string | null;
  references: string[];
  affectedVersions: string[] | null;
  fixedVersions: string[] | null;
  fixAvailable: boolean | null;
  intent: "CVE_LOOKUP";
  minerName: string | null;
  timestamp: string | null;
  reasoning: string | null;
  costUsd: number | null;
  durationMs: number | null;
  network: string | null;
  paymentScheme: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
}

export interface PublicReceiptCheck {
  label: string;
  outcome: "pass" | "fail" | "unknown";
  evidence?: string;
}

export interface PublicReceiptDecision {
  decision: "PASS" | "HOLD" | "REVIEW";
  reasonCode: string;
  summary: string;
  cveId: string;
  repositoryEvidence: PublicReceiptRepositoryEvidence;
  telegraphEvidence: PublicReceiptTelegraphEvidence | null;
  checks: PublicReceiptCheck[];
  evaluatedAt: string | null;
  policyVersion: string;
}

export interface PublicReceiptTelegraphRequest {
  cveId: string;
  intent: "CVE_LOOKUP";
  minerName: string | null;
  costUsd: number | null;
  durationMs: number | null;
  network: string | null;
  paymentScheme: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
  outcome: "success" | "failed";
}

export interface PublicReceiptRelease {
  repository: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  githubEvent: "pull_request" | "pull_request_target";
  actor: string;
  policyVersion: string;
  overallDecision: "PASS" | "HOLD" | "REVIEW";
  runReasonCode: string;
  runSummary: string;
  decisionCount: number;
  passCount: number;
  holdCount: number;
  reviewCount: number;
  telegraphRequestCount: number;
  telegraphCostUsd: number;
  evaluatedCves: string[];
  skippedCves: string[];
  usageClass: "production" | "demo" | "development" | "test";
  source: "action" | "backfill";
  startedAt: string;
  completedAt: string;
}

export interface ReceiptSnapshot {
  schemaVersion: ReceiptSchemaVersion;
  release: PublicReceiptRelease;
  decisions: PublicReceiptDecision[];
  telegraphRequests: PublicReceiptTelegraphRequest[];
}

export interface LimenEvidenceReceipt {
  id: ReceiptId;
  schemaVersion: ReceiptSchemaVersion;
  snapshotHash: string;
  publishedAt: string;
  snapshot: ReceiptSnapshot;
}

export interface ReceiptPublicationInput {
  runId: LedgerRunId;
  snapshot: ReceiptSnapshot;
  snapshotHash: string;
}

export interface ReceiptPublication {
  id: ReceiptId;
  runId: LedgerRunId;
  schemaVersion: ReceiptSchemaVersion;
  snapshotHash: string;
  publishedAt: string;
  revokedAt: string | null;
  created: boolean;
}

export interface RevokedReceipt {
  id: ReceiptId;
  revokedAt: string;
}

export type ReceiptLookup =
  | { status: "active"; receipt: LimenEvidenceReceipt }
  | { status: "revoked"; receipt: RevokedReceipt }
  | null;

export interface EvidenceReceiptStore {
  publishReceipt(input: ReceiptPublicationInput): Promise<ReceiptPublication>;
  getReceipt(id: ReceiptId): Promise<ReceiptLookup>;
  revokeReceipt(id: ReceiptId): Promise<ReceiptPublication>;
}
