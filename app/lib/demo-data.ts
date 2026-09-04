export const ACTIVE_HOLD_RECEIPT_ID = "LM-REC-B1306724D0B84B6EBDDF7E36";
export const REVOKED_PASS_RECEIPT_ID = "LM-REC-1463B3EF54DC4CA3827ED3DC";

export const HOLD_RUN_ID = "LM-RUN-12EBDEF224C44BDCB1B34740";
export const PASS_RUN_ID = "LM-RUN-346D6B341BEF4E648AFED751";

export const DEMO_REPOSITORY = "kaelah971/limen-demo";
export const DEMO_PULL_REQUEST = 1;
export const DEMO_POLICY_VERSION = "LP-fde4ac5cdba2";
export const DEMO_HOLD_ACTION_URL =
  "https://github.com/kaelah971/limen-demo/actions/runs/33654301781";
export const DEMO_PASS_ACTION_URL =
  "https://github.com/kaelah971/limen-demo/actions/runs/33655468552";
export const DEMO_PULL_REQUEST_URL =
  "https://github.com/kaelah971/limen-demo/pull/1";

export const HOLD_BASE_SHA = "2f2cd0bbcffd00c562c82d834fe2669afc3352f7";
export const HOLD_HEAD_SHA = "84bda870ae3b90713f3d3a01a4b6a50f647d98c3";
export const PASS_HEAD_SHA = "394d98d9d8aac8c02134abda6db4116b3f64c7ee";

export const HOLD_SNAPSHOT_HASH =
  "41cbf844690a2a15bf6d7d0fdc6bfd8bf8ae08cd684d735eb611d069f3ffebdf";
export const PASS_SNAPSHOT_HASH =
  "9ff2a5b271a1511267310ad70d919e2e05edcbf2119532cc2c4fec0a8c62ab61";

export interface DemoDecisionSummary {
  cveId: string;
  decision: "PASS" | "HOLD" | "REVIEW";
  repositorySeverity?: string;
  telegraphSeverity?: string;
}

export const DEMO_DECISIONS: DemoDecisionSummary[] = [
  {
    cveId: "CVE-2021-23337",
    decision: "HOLD",
    repositorySeverity: "HIGH",
    telegraphSeverity: "HIGH",
  },
  {
    cveId: "CVE-2026-4800",
    decision: "REVIEW",
    repositorySeverity: "HIGH",
    telegraphSeverity: "CRITICAL",
  },
  { cveId: "CVE-2020-28500", decision: "PASS" },
  { cveId: "CVE-2025-13465", decision: "PASS" },
  { cveId: "CVE-2026-2950", decision: "PASS" },
];

export const DEMO_LOOKUP_CVES = DEMO_DECISIONS.map(({ cveId }) => cveId);

export const DEMO_PRIMARY_EVIDENCE = {
  packageName: "lodash",
  installedVersion: "4.17.20",
  firstPatchedVersion: "4.17.21",
  vulnerableRange: "<4.17.21",
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  scope: "runtime",
  relationship: "direct",
  manifestPath: "package-lock.json",
  minerName: "PREFLIGHT Infrastructure Signals",
  costUsd: 0.01,
  durationMs: 1043,
  intent: "CVE_LOOKUP",
  network: "Base Sepolia",
  paymentScheme: "exact",
} as const;

export const DEMO_POLICY = {
  blockedSeverities: "critical, high",
  dependencyScopes: "runtime",
  uncertainty: "REVIEW",
} as const;

export const DEMO_HOLD_SUMMARY = {
  decisionCount: 5,
  passCount: 3,
  holdCount: 1,
  reviewCount: 1,
  telegraphRequestCount: 5,
  telegraphCostUsd: 0.05,
} as const;

export const DEMO_PASS_SUMMARY = {
  packageVersion: "4.18.1",
  decisionCount: 0,
  telegraphRequestCount: 0,
  telegraphCostUsd: 0,
} as const;
