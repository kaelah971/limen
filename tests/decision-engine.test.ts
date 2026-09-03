import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  LimenDecisionResultSchema,
  evaluateLimenDecision,
  type LimenDecisionInput,
  type LimenPolicy,
  type RepositoryExposureEvidence,
  type TelegraphCveEvidence,
} from "../packages/core/src";

const policy: LimenPolicy = {
  version: "p1-test",
  blockedSeverities: ["CRITICAL", "HIGH"],
  dependencyScopes: ["runtime"],
  missingExternalEvidence: "review",
  severityConflict: "review",
  cveIdentityConflict: "review",
  telegraphFailure: "review",
  unknownExposure: "review",
};

const baseRepositoryEvidence: RepositoryExposureEvidence = {
  repository: "acme/service",
  commitSha: "abc123",
  pullRequestNumber: 42,
  packageName: "lodash",
  ecosystem: "npm",
  installedVersion: "4.17.20",
  vulnerableRange: "<4.17.21",
  firstPatchedVersion: "4.17.21",
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  manifestPath: "package-lock.json",
  scope: "runtime",
  relationship: "direct",
  exposureState: "affected",
  source: "github_dependabot",
};

const baseTelegraphEvidence: TelegraphCveEvidence = {
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  description: "A vulnerability description.",
  references: ["https://example.com/advisory"],
  affectedVersions: ["<4.17.21"],
  fixedVersions: ["4.17.21"],
  fixAvailable: true,
  intent: "CVE_LOOKUP",
  minerId: "miner-42",
  minerName: "Evidence Miner",
  timestamp: "2026-09-02T10:00:00.900Z",
  reasoning: "The routed Miner matched the requested CVE.",
  endpoint: "https://miner.example.test/cve",
  costUsd: 0.01,
  durationMs: 985,
  network: "eip155:84532",
  paymentScheme: "exact",
  requestedAt: "2026-09-02T10:00:00.000Z",
  receivedAt: "2026-09-02T10:00:00.985Z",
  raw: {},
};

function createInput(
  repositoryOverrides: Partial<RepositoryExposureEvidence> = {},
  telegraph: LimenDecisionInput["telegraphEvidence"] = {
    status: "available",
    evidence: baseTelegraphEvidence,
  },
): LimenDecisionInput {
  return {
    id: "LM-TEST-001",
    evaluatedAt: "2026-09-02T10:01:00.000Z",
    repositoryEvidence: {
      ...baseRepositoryEvidence,
      ...repositoryOverrides,
    },
    telegraphEvidence: telegraph,
    policy,
  };
}

describe("evaluateLimenDecision", () => {
  it("emits a non-null evaluation timestamp for live evaluator output", () => {
    const result = evaluateLimenDecision(createInput());

    expect(result.evaluatedAt).toBe("2026-09-02T10:01:00.000Z");
  });

  it.each([
    {
      name: "clear vulnerable runtime release",
      repository: { exposureState: "affected" as const, scope: "runtime" as const },
      telegraph: { status: "available" as const, evidence: baseTelegraphEvidence },
      decision: "HOLD",
      reasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
    },
    {
      name: "patched release",
      repository: { exposureState: "patched" as const },
      telegraph: { status: "available" as const, evidence: baseTelegraphEvidence },
      decision: "PASS",
      reasonCode: "NO_BLOCKING_CONDITION",
    },
    {
      name: "missing Telegraph fields",
      repository: {},
      telegraph: {
        status: "available" as const,
        evidence: { ...baseTelegraphEvidence, cveId: null, severity: null },
      },
      decision: "REVIEW",
      reasonCode: "EXTERNAL_EVIDENCE_INCOMPLETE",
    },
    {
      name: "Telegraph failure",
      repository: {},
      telegraph: { status: "failed" as const, code: "TELEGRAPH_ENGINE_ERROR" as const },
      decision: "REVIEW",
      reasonCode: "TELEGRAPH_UNAVAILABLE",
    },
    {
      name: "severity disagreement",
      repository: { severity: "HIGH" as const },
      telegraph: {
        status: "available" as const,
        evidence: { ...baseTelegraphEvidence, severity: "CRITICAL" as const },
      },
      decision: "REVIEW",
      reasonCode: "SEVERITY_CONFLICT",
    },
    {
      name: "CVE identity disagreement",
      repository: {},
      telegraph: {
        status: "available" as const,
        evidence: { ...baseTelegraphEvidence, cveId: "CVE-2024-0001" },
      },
      decision: "REVIEW",
      reasonCode: "CVE_IDENTITY_CONFLICT",
    },
    {
      name: "no repository vulnerability",
      repository: { exposureState: "not_affected" as const },
      telegraph: { status: "available" as const, evidence: baseTelegraphEvidence },
      decision: "PASS",
      reasonCode: "NO_BLOCKING_CONDITION",
    },
  ])(
    "returns $decision for $name",
    ({ repository, telegraph, decision, reasonCode }) => {
      const result = evaluateLimenDecision(createInput(repository, telegraph));

      expect(result.decision).toBe(decision);
      expect(result.reasonCode).toBe(reasonCode);
      expect(LimenDecisionResultSchema.safeParse(result).success).toBe(true);
    },
  );

  it("does not hold an affected development dependency when only runtime is blocked", () => {
    const result = evaluateLimenDecision(
      createInput({ scope: "development", exposureState: "affected" }),
    );

    expect(result).toMatchObject({
      decision: "PASS",
      reasonCode: "NO_BLOCKING_CONDITION",
    });
  });

  it("is deterministic and does not mutate normalized evidence", () => {
    const input = createInput();
    const before = JSON.stringify(input);

    const first = evaluateLimenDecision(input);
    const second = evaluateLimenDecision(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("reviews unknown exposure and unknown severity", () => {
    expect(
      evaluateLimenDecision(createInput({ exposureState: "unknown" })),
    ).toMatchObject({ decision: "REVIEW", reasonCode: "EXPOSURE_UNKNOWN" });

    expect(
      evaluateLimenDecision(
        createInput({}, {
          status: "available",
          evidence: { ...baseTelegraphEvidence, severity: "UNKNOWN" },
        }),
      ),
    ).toMatchObject({ decision: "REVIEW", reasonCode: "SEVERITY_UNKNOWN" });

    expect(
      evaluateLimenDecision(createInput({ severity: "UNKNOWN" })),
    ).toMatchObject({ decision: "REVIEW", reasonCode: "SEVERITY_UNKNOWN" });
  });

  it("rejects policies outside the bounded P1 contract", () => {
    expect(() =>
      evaluateLimenDecision(
        {
          ...createInput(),
          policy: {
            ...policy,
            dependencyScopes: ["unknown"],
          } as unknown as LimenPolicy,
        },
      ),
    ).toThrowError(ConfigurationError);

    expect(() =>
      evaluateLimenDecision(
        {
          ...createInput(),
          policy: {
            ...policy,
            unexpected: true,
          } as unknown as LimenPolicy,
        },
      ),
    ).toThrowError(ConfigurationError);
  });
});
