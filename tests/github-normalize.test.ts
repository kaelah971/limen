import { describe, expect, it } from "vitest";
import {
  GitHubConfigurationError,
  GitHubDependencySnapshotWarningError,
  GitHubEvidenceConflictError,
  normalizeDependencyReviewChange,
  normalizeDependencyReviewEvidence,
  normalizeDependencyReviewResponse,
  normalizeDependabotAlert,
  normalizeEvidenceContext,
  normalizeGlobalAdvisory,
  type GitHubDependencyReviewChangeDto,
  type GitHubDependencyReviewResponseDto,
  type GitHubGlobalAdvisoryDto,
  type GitHubDependabotAlertDto,
} from "../packages/github/src";
import dependencyReviewVulnerable from "./fixtures/github/dependency-review-vulnerable.json";
import dependencyReviewNonVulnerable from "./fixtures/github/dependency-review-non-vulnerable.json";
import dependencyReviewRemoved from "./fixtures/github/dependency-review-removed.json";
import dependabotDevelopment from "./fixtures/github/dependabot-development.json";
import dependabotRuntime from "./fixtures/github/dependabot-runtime.json";
import globalAdvisoryMatching from "./fixtures/github/global-advisory-matching.json";
import globalAdvisoryMissingCve from "./fixtures/github/global-advisory-missing-cve.json";
import globalAdvisoryMissingPatch from "./fixtures/github/global-advisory-missing-patch.json";
import globalAdvisoryMultipleRanges from "./fixtures/github/global-advisory-multiple-ranges.json";

const context = {
  repository: "owner/repo",
  commitSha: "a".repeat(40),
  pullRequestNumber: 42,
};

function dtoAt(
  fixture: unknown,
  index = 0,
): GitHubDependencyReviewChangeDto {
  return (fixture as GitHubDependencyReviewChangeDto[])[index];
}

function advisoryDto(fixture: unknown): GitHubGlobalAdvisoryDto {
  return fixture as GitHubGlobalAdvisoryDto;
}

function alertDto(fixture: unknown): GitHubDependabotAlertDto {
  return fixture as GitHubDependabotAlertDto;
}

describe("Dependency Review normalization", () => {
  it("normalizes added and changed vulnerable dependencies as affected", () => {
    const [change] = normalizeDependencyReviewResponse({
      changes: [dtoAt(dependencyReviewVulnerable)],
      warnings: [],
    });
    const advisory = normalizeGlobalAdvisory(advisoryDto(globalAdvisoryMatching));
    const [result] = normalizeDependencyReviewEvidence({
      change,
      advisory,
      context,
    });

    expect(result).toMatchObject({
      status: "active",
      candidate: {
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
        source: "github-dependency-review+global-advisory",
      },
    });
    expect(result?.repositoryEvidence).toMatchObject({
      commitSha: context.commitSha,
      pullRequestNumber: 42,
      exposureState: "affected",
    });

    const changed = normalizeDependencyReviewChange({
      ...dtoAt(dependencyReviewVulnerable),
      change_type: "changed",
    });
    expect(
      normalizeDependencyReviewEvidence({ change: changed, advisory, context })[0]
        ?.repositoryEvidence?.exposureState,
    ).toBe("affected");
  });

  it("does not emit active evidence for removed or non-vulnerable changes", () => {
    const advisory = normalizeGlobalAdvisory(advisoryDto(globalAdvisoryMatching));
    const removed = normalizeDependencyReviewChange(dtoAt(dependencyReviewRemoved));
    const nonVulnerable = normalizeDependencyReviewChange(
      dtoAt(dependencyReviewNonVulnerable),
    );

    expect(
      normalizeDependencyReviewEvidence({ change: removed, advisory, context }),
    ).toEqual([]);
    expect(
      normalizeDependencyReviewEvidence({
        change: nonVulnerable,
        advisory,
        context,
      }),
    ).toEqual([]);
  });

  it("preserves unknown scope and relationship instead of guessing", () => {
    const change = normalizeDependencyReviewChange({
      ...dtoAt(dependencyReviewVulnerable),
      scope: null,
      relationship: null,
    });

    expect(change.scope).toBe("unknown");
    expect(change.relationship).toBe("unknown");
  });

  it("does not use a vulnerability range for the wrong advisory package", () => {
    const change = normalizeDependencyReviewChange(dtoAt(dependencyReviewVulnerable));
    const advisory = normalizeGlobalAdvisory({
      ...advisoryDto(globalAdvisoryMatching),
      vulnerabilities: [
        {
          ...advisoryDto(globalAdvisoryMatching).vulnerabilities[0],
          package: { ecosystem: "npm", name: "other-package" },
        },
      ],
    });
    const [result] = normalizeDependencyReviewEvidence({
      change,
      advisory,
      context,
    });

    expect(result).toMatchObject({
      status: "active",
      candidate: {
        cveId: "CVE-2021-23337",
        vulnerableRange: null,
        firstPatchedVersion: null,
      },
    });
  });

  it("does not choose arbitrarily when multiple advisory ranges match", () => {
    const change = normalizeDependencyReviewChange(dtoAt(dependencyReviewVulnerable));
    const advisory = normalizeGlobalAdvisory(
      advisoryDto(globalAdvisoryMultipleRanges),
    );
    const [result] = normalizeDependencyReviewEvidence({
      change,
      advisory,
      context,
    });

    expect(result?.repositoryEvidence).toMatchObject({
      vulnerableRange: null,
      firstPatchedVersion: null,
    });
  });

  it("preserves a missing patch as null", () => {
    const change = normalizeDependencyReviewChange(dtoAt(dependencyReviewVulnerable));
    const advisory = normalizeGlobalAdvisory(
      advisoryDto(globalAdvisoryMissingPatch),
    );
    const [result] = normalizeDependencyReviewEvidence({
      change,
      advisory,
      context,
    });

    expect(result?.repositoryEvidence?.firstPatchedVersion).toBeNull();
  });

  it("preserves a GHSA-only advisory without fabricating a CVE", () => {
    const change = normalizeDependencyReviewChange(dtoAt(dependencyReviewVulnerable));
    const advisory = normalizeGlobalAdvisory(advisoryDto(globalAdvisoryMissingCve));
    const [result] = normalizeDependencyReviewEvidence({
      change,
      advisory,
      context,
    });

    expect(result).toMatchObject({
      status: "missing-cve",
      repositoryEvidence: null,
      candidate: {
        ghsaId: "GHSA-35JH-R3H4-6JHM",
        cveId: null,
        exposureState: "affected",
      },
    });
  });

  it("surfaces severity conflicts instead of choosing a source silently", () => {
    const change = normalizeDependencyReviewChange(dtoAt(dependencyReviewVulnerable));
    const advisory = normalizeGlobalAdvisory({
      ...advisoryDto(globalAdvisoryMatching),
      severity: "critical",
      vulnerabilities: advisoryDto(globalAdvisoryMatching).vulnerabilities.map(
        (vulnerability) => ({ ...vulnerability, severity: "critical" }),
      ),
    });

    expect(() =>
      normalizeDependencyReviewEvidence({ change, advisory, context }),
    ).toThrowError(GitHubEvidenceConflictError);
  });

  it("rejects snapshot warnings before normalization can look clean", () => {
    const response: GitHubDependencyReviewResponseDto = {
      changes: [],
      warnings: [{
        code: "SNAPSHOT_STALE",
        message: "Dependency snapshot is stale.",
      }],
    };

    expect(() => normalizeDependencyReviewResponse(response)).toThrowError(
      GitHubDependencySnapshotWarningError,
    );
  });
});

describe("Global Advisory normalization", () => {
  it("uses primary CVSS, then v3 and v4 fallback values", () => {
    const advisory = normalizeGlobalAdvisory({
      ...advisoryDto(globalAdvisoryMatching),
      cvss: null,
      cvss_severities: {
        cvss_v3: null,
        cvss_v4: { score: 8.1 },
      },
    });

    expect(advisory.cvssScore).toBe(8.1);
  });

  it("derives a CVE from advisory identifiers when cve_id is null", () => {
    const advisory = normalizeGlobalAdvisory({
      ...advisoryDto(globalAdvisoryMissingCve),
      identifiers: [
        { type: "GHSA", value: "GHSA-35jh-r3h4-6jhm" },
        { type: "CVE", value: "CVE-2021-23337" },
      ],
    });

    expect(advisory.cveId).toBe("CVE-2021-23337");
  });
});

describe("Dependabot normalization", () => {
  it("maps an open runtime/direct alert to repository evidence", () => {
    const result = normalizeDependabotAlert(alertDto(dependabotRuntime), context);

    expect(result).toMatchObject({
      status: "active",
      candidate: {
        packageName: "lodash",
        ecosystem: "npm",
        installedVersion: null,
        vulnerableRange: "<4.17.21",
        firstPatchedVersion: "4.17.21",
        cveId: "CVE-2021-23337",
        severity: "HIGH",
        cvssScore: 7.2,
        manifestPath: "package-lock.json",
        scope: "runtime",
        relationship: "direct",
        exposureState: "affected",
        source: "github-dependabot-alert",
      },
    });
  });

  it("preserves development/transitive alert context", () => {
    const result = normalizeDependabotAlert(
      alertDto(dependabotDevelopment),
      context,
    );

    expect(result.candidate).toMatchObject({
      scope: "development",
      relationship: "transitive",
      installedVersion: null,
    });
  });

  it("keeps missing alert CVEs explicit", () => {
    const result = normalizeDependabotAlert(
      {
        ...alertDto(dependabotRuntime),
        security_advisory: {
          ...alertDto(dependabotRuntime).security_advisory,
          cve_id: null,
          identifiers: [
            { type: "GHSA", value: "GHSA-35jh-r3h4-6jhm" },
          ],
        },
      },
      context,
    );

    expect(result).toMatchObject({
      status: "missing-cve",
      repositoryEvidence: null,
      candidate: { cveId: null },
    });
  });

  it("does not emit dismissed or fixed alerts as active exposure", () => {
    const result = normalizeDependabotAlert(
      { ...alertDto(dependabotRuntime), state: "fixed" },
      context,
    );

    expect(result).toMatchObject({
      status: "inactive",
      repositoryEvidence: null,
      candidate: { exposureState: "unknown" },
    });
  });

  it("rejects mismatched alert package identities", () => {
    expect(() =>
      normalizeDependabotAlert(
        {
          ...alertDto(dependabotRuntime),
          security_vulnerability: {
            ...alertDto(dependabotRuntime).security_vulnerability,
            package: { ecosystem: "npm", name: "other-package" },
          },
        },
        context,
      ),
    ).toThrowError(GitHubEvidenceConflictError);
  });
});

describe("GitHub evidence context", () => {
  it("requires full commit SHAs when a commit identity is supplied", () => {
    expect(() =>
      normalizeEvidenceContext({ commitSha: "abcdef1" }),
    ).toThrowError(GitHubConfigurationError);
  });
});
