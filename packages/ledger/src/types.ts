import type {
  LimenDecision,
  LimenDecisionResult,
} from "../../core/src";

export type LedgerUsageClass =
  | "production"
  | "demo"
  | "development"
  | "test";

export type LedgerSource = "action" | "backfill";

export interface LedgerRunMetadata {
  id?: string;
  repository: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  githubRunId: number;
  githubRunAttempt: number;
  githubEvent: "pull_request" | "pull_request_target";
  actor: string;
  policyVersion: string;
  overallDecision: LimenDecision;
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
  isTest: boolean;
  usageClass: LedgerUsageClass;
  source: LedgerSource;
  startedAt: string;
  completedAt: string;
}

export interface SafeTelegraphRequestRecord {
  cveId: string;
  intent: "CVE_LOOKUP";
  minerId: string | null;
  minerName: string | null;
  costUsd: number | null;
  durationMs: number | null;
  network: string | null;
  paymentScheme: string | null;
  requestedAt: string;
  receivedAt: string | null;
  outcome: "success" | "failed";
  settlementReference: string | null;
}

export interface LedgerRunIngest {
  run: LedgerRunMetadata;
  decisions: LimenDecisionResult[];
  telegraphRequests: SafeTelegraphRequestRecord[];
}

export interface PersistedRun {
  id: string;
  created: boolean;
}

export interface PersistedRunDetail {
  run: LedgerRunMetadata & { id: string };
  decisions: LimenDecisionResult[];
  telegraphRequests: SafeTelegraphRequestRecord[];
}

export interface EvidenceLedger {
  persistRun(input: LedgerRunIngest): Promise<PersistedRun>;
  getRun(id: string): Promise<PersistedRunDetail | null>;
}
