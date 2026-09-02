import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LimenPolicyDuplicateKeyError,
  LimenPolicyNotFoundError,
  LimenPolicyParseError,
  LimenPolicyReadError,
  LimenPolicyValidationError,
  evaluateLimenDecision,
  loadLimenPolicy,
  parseLimenPolicy,
  type RepositoryExposureEvidence,
  type TelegraphCveEvidence,
} from "../packages/core/src";

const FULL_POLICY = `production:
  block_severity:
    - critical
    - high

  dependency_scopes:
    - runtime

  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review
`;

const MINIMAL_POLICY = `production:
  block_severity: [critical, high]
  dependency_scopes: [runtime]
`;

let repositoryRoot: string;

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "limen-policy-"));
});

afterEach(async () => {
  await rm(repositoryRoot, { recursive: true, force: true });
});

const repositoryEvidence: RepositoryExposureEvidence = {
  repository: "acme/service",
  commitSha: "abc123",
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

const telegraphEvidence: TelegraphCveEvidence = {
  cveId: "CVE-2021-23337",
  severity: "HIGH",
  cvssScore: 7.2,
  description: "A vulnerability description.",
  references: [],
  affectedVersions: null,
  fixedVersions: null,
  fixAvailable: null,
  intent: "CVE_LOOKUP",
  minerId: "miner-42",
  minerName: "Evidence Miner",
  timestamp: null,
  reasoning: null,
  endpoint: null,
  costUsd: 0.01,
  durationMs: 985,
  network: "eip155:84532",
  paymentScheme: "exact",
  requestedAt: "2026-09-02T10:00:00.000Z",
  receivedAt: "2026-09-02T10:00:00.985Z",
  raw: {},
};

describe("parseLimenPolicy", () => {
  it("parses the approved snake_case policy into the existing LimenPolicy", () => {
    const policy = parseLimenPolicy(FULL_POLICY);

    expect(policy).toEqual({
      version: expect.stringMatching(/^LP-[0-9a-f]{12}$/),
      blockedSeverities: ["CRITICAL", "HIGH"],
      dependencyScopes: ["runtime"],
      missingExternalEvidence: "review",
      severityConflict: "review",
      cveIdentityConflict: "review",
      telegraphFailure: "review",
      unknownExposure: "review",
    });
  });

  it("defaults omitted uncertainty settings to review", () => {
    expect(parseLimenPolicy(MINIMAL_POLICY)).toEqual(
      parseLimenPolicy(FULL_POLICY),
    );
  });

  it("normalizes severity and scope casing and canonicalizes set ordering", () => {
    const policy = parseLimenPolicy(`production:
  block_severity: [high, CRITICAL]
  dependency_scopes: [DEVELOPMENT, runtime]
`);

    expect(policy.blockedSeverities).toEqual(["CRITICAL", "HIGH"]);
    expect(policy.dependencyScopes).toEqual(["runtime", "development"]);
  });

  it.each([
    ["invalid severity", "production:\n  block_severity: [extreme]\n  dependency_scopes: [runtime]"],
    ["invalid scope", "production:\n  block_severity: [high]\n  dependency_scopes: [banana]"],
    ["invalid uncertainty action", "production:\n  block_severity: [high]\n  dependency_scopes: [runtime]\n  telegraph_failure: pass"],
    ["empty severity array", "production:\n  block_severity: []\n  dependency_scopes: [runtime]"],
    ["empty scope array", "production:\n  block_severity: [high]\n  dependency_scopes: []"],
    ["duplicate normalized severity", "production:\n  block_severity: [high, HIGH]\n  dependency_scopes: [runtime]"],
    ["duplicate normalized scope", "production:\n  block_severity: [high]\n  dependency_scopes: [runtime, RUNTIME]"],
    ["wrong scalar type", "production:\n  block_severity: high\n  dependency_scopes: [runtime]"],
  ])("rejects %s", (_name, source) => {
    expect(() => parseLimenPolicy(source)).toThrowError(
      LimenPolicyValidationError,
    );
  });

  it("rejects UNKNOWN as a configured blocking severity", () => {
    expect(() =>
      parseLimenPolicy(`production:
  block_severity: [unknown]
  dependency_scopes: [runtime]
`),
    ).toThrowError(LimenPolicyValidationError);
  });

  it("rejects unknown keys with their external path", () => {
    expect(() =>
      parseLimenPolicy(`production:
  block_severty: [high]
  dependency_scopes: [runtime]
`),
    ).toThrow(/production.*block_severty/);
  });

  it.each([
    ["missing production", "block_severity: [high]\ndependency_scopes: [runtime]"],
    ["missing block severity", "production:\n  dependency_scopes: [runtime]"],
    ["missing dependency scopes", "production:\n  block_severity: [high]"],
  ])("rejects %s", (_name, source) => {
    expect(() => parseLimenPolicy(source)).toThrowError(
      LimenPolicyValidationError,
    );
  });

  it("rejects duplicate YAML keys", () => {
    expect(() =>
      parseLimenPolicy(`production:
  block_severity: [critical]
  block_severity: [low]
  dependency_scopes: [runtime]
`),
    ).toThrowError(LimenPolicyDuplicateKeyError);
  });

  it("rejects malformed YAML with a typed parse error", () => {
    expect(() =>
      parseLimenPolicy(`production:
  block_severity: [critical
  dependency_scopes: [runtime]
`),
    ).toThrowError(LimenPolicyParseError);
  });

  it("rejects executable YAML tags and aliases", () => {
    expect(() =>
      parseLimenPolicy(`production: !!js/function function () { return true; }
`),
    ).toThrowError(LimenPolicyValidationError);

    expect(() =>
      parseLimenPolicy(`defaults: &defaults
  block_severity: [high]
production:
  <<: *defaults
  dependency_scopes: [runtime]
`),
    ).toThrow();
  });

  it("rejects prototype-pollution-style keys without mutating Object.prototype", () => {
    expect(() =>
      parseLimenPolicy(`__proto__:
  polluted: true
production:
  block_severity: [high]
  dependency_scopes: [runtime]
`),
    ).toThrowError(LimenPolicyValidationError);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("Limen policy versioning", () => {
  it("ignores comments, whitespace, key ordering, and set-like array ordering", () => {
    const first = parseLimenPolicy(FULL_POLICY);
    const second = parseLimenPolicy(`# equivalent policy
production:
  telegraph_failure: review
  cve_identity_conflict: review
  dependency_scopes:
    - runtime
  block_severity: [HIGH, critical]
  severity_conflict: review
  missing_external_evidence: review
`);

    expect(second.version).toBe(first.version);
  });

  it("keeps explicit and default review semantics on the same version", () => {
    expect(parseLimenPolicy(MINIMAL_POLICY).version).toBe(
      parseLimenPolicy(FULL_POLICY).version,
    );
  });

  it("changes version when effective blocking content changes", () => {
    const severityChange = parseLimenPolicy(`production:
  block_severity: [critical]
  dependency_scopes: [runtime]
`);
    const scopeChange = parseLimenPolicy(`production:
  block_severity: [critical, high]
  dependency_scopes: [development]
`);

    expect(severityChange.version).not.toBe(parseLimenPolicy(FULL_POLICY).version);
    expect(scopeChange.version).not.toBe(parseLimenPolicy(FULL_POLICY).version);
  });
});

describe("loadLimenPolicy", () => {
  it("loads limen.yml from the repository root", async () => {
    await writeFile(join(repositoryRoot, "limen.yml"), FULL_POLICY, "utf8");

    const loaded = await loadLimenPolicy({ cwd: repositoryRoot });

    expect(loaded.source).toEqual({
      path: join(repositoryRoot, "limen.yml"),
      format: "yaml",
    });
    expect(loaded.policy.blockedSeverities).toEqual(["CRITICAL", "HIGH"]);
  });

  it("uses limen.yml before the optional limen.yaml fallback", async () => {
    await writeFile(join(repositoryRoot, "limen.yml"), FULL_POLICY, "utf8");
    await writeFile(join(repositoryRoot, "limen.yaml"), `production:
  block_severity: [low]
  dependency_scopes: [development]
`, "utf8");

    const loaded = await loadLimenPolicy({ cwd: repositoryRoot });

    expect(loaded.source.path).toBe(join(repositoryRoot, "limen.yml"));
    expect(loaded.policy.blockedSeverities).toEqual(["CRITICAL", "HIGH"]);
  });

  it("supports an explicit relative policy path", async () => {
    await writeFile(join(repositoryRoot, "custom-policy.yml"), FULL_POLICY, "utf8");

    const loaded = await loadLimenPolicy({
      cwd: repositoryRoot,
      filePath: "custom-policy.yml",
    });

    expect(loaded.source.path).toBe(join(repositoryRoot, "custom-policy.yml"));
  });

  it("reports a typed error when no policy file exists", async () => {
    await expect(loadLimenPolicy({ cwd: repositoryRoot })).rejects.toThrowError(
      LimenPolicyNotFoundError,
    );
  });

  it("reports a typed parse error for a malformed policy file", async () => {
    await writeFile(
      join(repositoryRoot, "limen.yml"),
      "production:\n  block_severity: [high\n",
      "utf8",
    );

    await expect(loadLimenPolicy({ cwd: repositoryRoot })).rejects.toThrowError(
      LimenPolicyParseError,
    );
  });

  it("reports a typed read error when the explicit path is not a file", async () => {
    await expect(
      loadLimenPolicy({ cwd: repositoryRoot, filePath: "." }),
    ).rejects.toThrowError(LimenPolicyReadError);
  });

  it("does not execute or expand values while loading", async () => {
    await writeFile(join(repositoryRoot, "limen.yml"), `production:
  block_severity: ["${"${HOME}"}"]
  dependency_scopes: [runtime]
`, "utf8");

    await expect(loadLimenPolicy({ cwd: repositoryRoot })).rejects.toThrowError(
      LimenPolicyValidationError,
    );
  });
});

describe("YAML policy to P1 integration", () => {
  it.each([
    ["HOLD", "affected" as const, "available" as const],
    ["PASS", "patched" as const, "available" as const],
    ["REVIEW", "affected" as const, "failed" as const],
  ] as const)("feeds %s into the existing decision engine", (expected, exposureState, status) => {
    const policy = parseLimenPolicy(MINIMAL_POLICY);
    const result = evaluateLimenDecision({
      id: "LM-P2-TEST-001",
      evaluatedAt: "2026-09-02T10:01:00.000Z",
      repositoryEvidence: { ...repositoryEvidence, exposureState },
      telegraphEvidence:
        status === "available"
          ? { status, evidence: telegraphEvidence }
          : { status, code: "TELEGRAPH_ENGINE_ERROR" },
      policy,
    });

    expect(result.decision).toBe(expected);
    expect(result.policyVersion).toBe(policy.version);
  });

  it("keeps the example policy valid", async () => {
    const example = await readFile(
      join(process.cwd(), "examples", "limen.yml"),
      "utf8",
    );

    expect(parseLimenPolicy(example).blockedSeverities).toEqual([
      "CRITICAL",
      "HIGH",
    ]);
  });
});
