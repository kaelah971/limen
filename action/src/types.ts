import type {
  GitHubClient,
} from "../../packages/github/src";
import type {
  LimenDecisionResult,
  LimenPolicy,
  LimenObservabilityLogger,
} from "../../packages/core/src";
import type { TelegraphClient } from "../../packages/telegraph/src";
import type {
  LedgerUsageClass,
  SafeTelegraphRequestRecord,
} from "../../packages/ledger/src/types";

export interface ActionPullRequestContext {
  owner: string;
  repo: string;
  repository: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  actor: string;
  eventName: "pull_request";
  authorAssociation: string;
  githubRunId?: number;
  githubRunAttempt?: number;
}

export interface ActionInputs {
  githubToken: string;
  telegraphPrivateKey?: string;
  telegraphEngineUrl?: string;
  expectedNetwork?: string;
  maxLookups: number;
  ledgerUrl?: string;
  ledgerToken?: string;
  usageClass: LedgerUsageClass;
}

export interface LimenRunResult {
  runId: string;
  overallDecision: "PASS" | "HOLD" | "REVIEW";
  decisions: LimenDecisionResult[];
  policyVersion: string;
  evaluatedCves: string[];
  skippedCves: string[];
  telegraphRequestCount: number;
  telegraphCostUsd: number;
  telegraphCostKnown?: boolean;
  telegraphRequests: SafeTelegraphRequestRecord[];
  baseSha: string;
  headSha: string;
  pullRequestNumber: number;
  evaluatedAt: string;
  budgetExceeded: boolean;
  missingCveCount: number;
  runReasonCode: string;
  runReasons: string[];
  runSummary: string;
  context: ActionPullRequestContext;
  startedAt: string;
  completedAt: string;
  ledgerRunId?: string;
  ledgerPersisted?: boolean;
  ledgerStatus?: "not-configured" | "partial" | "recorded" | "failed";
  ledgerPersistenceDurationMs?: number;
  ledgerErrorCode?: string;
  ledgerHttpStatus?: number;
}

export interface OrchestrationDependencies {
  githubClient: GitHubClient;
  telegraphClientFactory?: () => TelegraphClient;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  createRunId?: () => string;
  observability?: LimenObservabilityLogger;
}

export interface OrchestrateLimenRunInput {
  context: ActionPullRequestContext;
  policy: LimenPolicy;
  maxLookups: number;
  dependencies: OrchestrationDependencies;
}
