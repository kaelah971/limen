import type {
  LimenEvidenceReceipt,
  PublicReceiptDecision,
} from "../../packages/receipts/src/types";

export function formatEvidenceValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  return String(value);
}

export function formatEvidenceList(values: string[] | null | undefined): string {
  if (values === null || values === undefined) {
    return "Not available";
  }
  return values.length === 0 ? "None recorded" : values.join(", ");
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not available";
  }
  return `$${value.toFixed(2)}`;
}

export function formatTimestamp(value: string | null | undefined): string {
  return value ?? "Not available";
}

export function getPrimaryDecision(
  receipt: LimenEvidenceReceipt,
): PublicReceiptDecision | null {
  const { release, decisions } = receipt.snapshot;
  return decisions.find((decision) => decision.decision === release.overallDecision)
    ?? decisions[0]
    ?? null;
}

export function getDecisionReason(decision: LimenEvidenceReceipt["snapshot"]["release"]["overallDecision"]): string {
  switch (decision) {
    case "HOLD":
      return "This release matches a blocking dependency policy condition.";
    case "REVIEW":
      return "This release needs human review because the evidence is incomplete, conflicting or unavailable.";
    case "PASS":
      return "The available evidence supports proceeding under the recorded policy.";
  }
}

export function getNextAction(receipt: LimenEvidenceReceipt): string {
  const { release } = receipt.snapshot;
  const primary = getPrimaryDecision(receipt);
  if (release.overallDecision === "HOLD") {
    const evidence = primary?.repositoryEvidence;
    return evidence
      ? "Update the dependency to a version that clears all blocking findings under the current policy."
      : "Resolve the blocking dependency condition before releasing.";
  }
  if (release.overallDecision === "REVIEW") {
    return "Investigate the evidence or rerun the check before releasing.";
  }
  return "Continue the release under the recorded policy.";
}

export function githubRepositoryUrl(repository: string): string | null {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part))) {
    return null;
  }
  return `https://github.com/${parts.map(encodeURIComponent).join("/")}`;
}

export function githubPullRequestUrl(receipt: LimenEvidenceReceipt): string | null {
  const repositoryUrl = githubRepositoryUrl(receipt.snapshot.release.repository);
  return repositoryUrl === null
    ? null
    : `${repositoryUrl}/pull/${receipt.snapshot.release.pullRequestNumber}`;
}

export function decisionCounts(receipt: LimenEvidenceReceipt): string {
  const { release } = receipt.snapshot;
  return `${release.passCount} PASS / ${release.holdCount} HOLD / ${release.reviewCount} REVIEW`;
}
