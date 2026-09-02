import {
  normalizeSeverity,
  type Severity,
} from "../../core/src";
import { GitHubEvidenceConflictError } from "./errors";
import {
  createNormalizationResult,
  normalizeEcosystem,
  normalizeEvidenceContext,
  normalizeRelationship,
  normalizeScope,
} from "./evidence";
import { normalizeGlobalAdvisory } from "./normalize-advisory";
import type {
  GitHubDependabotAlertDto,
  GitHubEvidenceCandidate,
  GitHubEvidenceContext,
  GitHubEvidenceNormalizationResult,
} from "./types";

function knownSeverity(value: Severity | null): value is Exclude<Severity, "UNKNOWN"> {
  return value !== null && value !== "UNKNOWN";
}

export function normalizeDependabotAlert(
  alert: GitHubDependabotAlertDto,
  context?: GitHubEvidenceContext,
): GitHubEvidenceNormalizationResult {
  const advisory = normalizeGlobalAdvisory(alert.security_advisory);
  const dependencyEcosystem = normalizeEcosystem(
    alert.dependency.package.ecosystem,
  );
  const dependencyName = alert.dependency.package.name.trim();
  const vulnerabilityEcosystem = normalizeEcosystem(
    alert.security_vulnerability.package.ecosystem,
  );
  const vulnerabilityName = alert.security_vulnerability.package.name.trim();

  if (
    dependencyEcosystem !== vulnerabilityEcosystem ||
    dependencyName !== vulnerabilityName
  ) {
    throw new GitHubEvidenceConflictError(
      "Dependabot dependency and vulnerability package identities conflict.",
      {
        dependencyEcosystem,
        dependencyName,
        vulnerabilityEcosystem,
        vulnerabilityName,
      },
    );
  }

  const alertSeverity = normalizeSeverity(alert.security_vulnerability.severity);
  if (
    knownSeverity(advisory.severity) &&
    knownSeverity(alertSeverity) &&
    advisory.severity !== alertSeverity
  ) {
    throw new GitHubEvidenceConflictError(
      "Dependabot advisory and vulnerability severity values conflict.",
      {
        packageName: dependencyName,
        ecosystem: dependencyEcosystem,
        advisorySeverity: advisory.severity,
        vulnerabilitySeverity: alertSeverity,
      },
    );
  }

  const candidate: GitHubEvidenceCandidate = {
    ...normalizeEvidenceContext(context),
    packageName: dependencyName,
    ecosystem: dependencyEcosystem,
    installedVersion: null,
    vulnerableRange:
      alert.security_vulnerability.vulnerable_version_range.trim() || null,
    firstPatchedVersion:
      alert.security_vulnerability.first_patched_version?.identifier.trim() || null,
    cveId: advisory.cveId,
    ghsaId: advisory.ghsaId,
    severity: advisory.severity ?? alertSeverity,
    cvssScore: advisory.cvssScore,
    manifestPath: alert.dependency.manifest_path?.trim() || null,
    scope: normalizeScope(alert.dependency.scope),
    relationship: normalizeRelationship(alert.dependency.relationship),
    exposureState: alert.state === "open" ? "affected" : "unknown",
    source: "github-dependabot-alert",
  };

  if (alert.state !== "open") {
    return createNormalizationResult(candidate, "inactive");
  }
  return createNormalizationResult(
    candidate,
    candidate.cveId === null ? "missing-cve" : "active",
  );
}
