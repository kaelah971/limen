import Link from "next/link";
import type {
  LimenEvidenceReceipt,
  PublicReceiptDecision,
  PublicReceiptRepositoryEvidence,
  PublicReceiptTelegraphEvidence,
} from "@/packages/receipts/src/types";
import { getDecisionReason, getNextAction, getPrimaryDecision, decisionCounts, formatCurrency, formatTimestamp, githubPullRequestUrl, githubRepositoryUrl } from "@/app/lib/receipt-view";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { LimenFooter, LimenHeader, PageFrame } from "./brand";
import { DecisionBadge } from "./decision-badge";
import { EvidenceCard, EvidenceField, EvidenceListField, EvidencePath, ReceiptProvenance, TelegraphRequestList } from "./evidence-primitives";

function decisionHeadline(decision: LimenEvidenceReceipt["snapshot"]["release"]["overallDecision"]): string {
  switch (decision) {
    case "HOLD":
      return "This release is held.";
    case "REVIEW":
      return "This release needs review.";
    case "PASS":
      return "This release can proceed.";
  }
}

function RepositoryEvidenceCard({ evidence }: { evidence: PublicReceiptRepositoryEvidence }) {
  return (
    <EvidenceCard
      source="GitHub / Dependency Review"
      title="Repository evidence"
      caption="Repository-specific package context and exposure facts."
    >
      <dl className="evidence-record-grid">
        <EvidenceField label="Package" value={evidence.packageName} />
        <EvidenceField label="Installed" value={evidence.installedVersion} />
        <EvidenceField label="Relationship" value={evidence.relationship} />
        <EvidenceField label="Scope" value={evidence.scope} />
        <EvidenceField label="Manifest" value={evidence.manifestPath} />
        <EvidenceField label="CVE" value={evidence.cveId} />
        <EvidenceField label="Affected range" value={evidence.vulnerableRange} />
        <EvidenceField label="First patched" value={evidence.firstPatchedVersion} />
        <EvidenceField label="Severity" value={evidence.severity} />
        <EvidenceField label="CVSS" value={evidence.cvssScore} />
        <EvidenceField label="Exposure" value={evidence.exposureState} />
        <EvidenceField label="Source" value={evidence.source} />
      </dl>
    </EvidenceCard>
  );
}

function TelegraphEvidenceCard({
  evidence,
  requests,
}: {
  evidence: PublicReceiptTelegraphEvidence | null;
  requests: LimenEvidenceReceipt["snapshot"]["telegraphRequests"];
}) {
  return (
    <EvidenceCard
      source="Telegraph / CVE_LOOKUP"
      title="Routed CVE evidence"
      caption="External evidence and operational provenance, kept separate from repository facts."
    >
      {evidence ? (
        <>
          <dl className="evidence-record-grid">
            <EvidenceField label="CVE" value={evidence.cveId} />
            <EvidenceField label="Severity" value={evidence.severity} />
            <EvidenceField label="CVSS" value={evidence.cvssScore} />
            <EvidenceListField label="Affected" value={evidence.affectedVersions} />
            <EvidenceListField label="Fixed" value={evidence.fixedVersions} />
            <EvidenceField label="Miner" value={evidence.minerName} />
            <EvidenceField label="Intent" value={evidence.intent} />
            <EvidenceField label="Cost" value={formatCurrency(evidence.costUsd)} />
            <EvidenceField label="Latency" value={evidence.durationMs === null ? null : `${evidence.durationMs} ms`} />
            <EvidenceField label="Network" value={evidence.network} />
            <EvidenceField label="Payment" value={evidence.paymentScheme} />
            <EvidenceField label="Timestamp" value={formatTimestamp(evidence.timestamp)} />
            <EvidenceField label="Requested" value={formatTimestamp(evidence.requestedAt)} />
            <EvidenceField label="Received" value={formatTimestamp(evidence.receivedAt)} />
          </dl>
          {requests.length > 0 ? <TelegraphRequestList requests={requests} /> : null}
        </>
      ) : (
        <div className="empty-evidence">
          <h2>Not available</h2>
          <p>Limen did not infer external evidence that was not present in the public receipt.</p>
        </div>
      )}
    </EvidenceCard>
  );
}

function PolicyEvaluation({ decision }: { decision: PublicReceiptDecision }) {
  return (
    <EvidenceCard
      source="Limen policy"
      title="Policy evaluation"
      caption={`Relevant checks from policy version ${decision.policyVersion}.`}
    >
      {decision.checks.length > 0 ? (
        <ul className="policy-list" aria-label="Policy checks">
          {decision.checks.map((check) => (
            <li className="policy-row" key={`${check.label}-${check.outcome}`}>
              <span>{check.label}</span>
              <span>{check.evidence ?? "Not available"}</span>
              <span className={`policy-outcome-${check.outcome}`}>
                {check.outcome.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-evidence">
          <h2>No decision checks recorded</h2>
          <p>The public receipt contains no additional policy check rows for this decision.</p>
        </div>
      )}
    </EvidenceCard>
  );
}

function OtherDecisions({ decisions }: { decisions: PublicReceiptDecision[] }) {
  if (decisions.length === 0) return null;
  return (
    <EvidenceCard
      source="Other evaluated CVEs"
      title="The rest of this release"
      caption="Additional decisions remain available without competing with the primary outcome."
    >
      <div className="compact-decision-list">
        {decisions.map((decision) => (
          <details className="compact-decision" key={`${decision.cveId}-${decision.reasonCode}`}>
            <summary>
              <DecisionBadge decision={decision.decision} />
              <code>{decision.cveId}</code>
            </summary>
            <p>{decision.summary}</p>
          </details>
        ))}
      </div>
    </EvidenceCard>
  );
}

function ZeroDecisionState({ receipt }: { receipt: LimenEvidenceReceipt }) {
  const { release } = receipt.snapshot;
  return (
    <section className="empty-evidence">
      <h2>{release.runSummary}</h2>
      <p>No blocking dependency vulnerability was introduced by this pull request.</p>
      <div className="empty-evidence-stats">
        <span><strong>{release.decisionCount}</strong><small>relevant decisions</small></span>
        <span><strong>{release.telegraphRequestCount}</strong><small>Telegraph requests</small></span>
        <span><strong>{formatCurrency(release.telegraphCostUsd)}</strong><small>routing cost</small></span>
      </div>
    </section>
  );
}

export function ReceiptDetail({ receipt }: { receipt: LimenEvidenceReceipt }) {
  const { release, decisions, telegraphRequests } = receipt.snapshot;
  const primary = getPrimaryDecision(receipt);
  const otherDecisions = primary === null ? [] : decisions.filter((decision) => decision !== primary);
  const pullRequestUrl = githubPullRequestUrl(receipt);
  const repositoryUrl = githubRepositoryUrl(release.repository);

  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main receipt-page">
        <div className="content-container">
          <header className="receipt-heading">
            <div>
              <p className="eyebrow">Public release evidence</p>
              <h1>
                <span>{release.repository}</span>
                <span>PR #{release.pullRequestNumber}</span>
              </h1>
              {pullRequestUrl && repositoryUrl ? (
                <a className="trace-link" href={pullRequestUrl} target="_blank" rel="noreferrer noopener">
                  View source pull request <ArrowUpRight aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="receipt-id-block">
              <span className="receipt-id-label">Receipt ID</span>
              <span className="receipt-id"><code>{receipt.id}</code></span>
            </div>
          </header>

          <section className="decision-surface" aria-labelledby="decision-heading">
            <div className="decision-surface-grid">
              <div>
                <DecisionBadge decision={release.overallDecision} />
                <h2 id="decision-heading">{decisionHeadline(release.overallDecision)}</h2>
                <p className="decision-summary">{getDecisionReason(release.overallDecision)}</p>
                <div className="action-card">
                  <strong>Next action</strong>
                  <p>{getNextAction(receipt)}</p>
                </div>
                <div className="reason-card">
                  <strong>Recorded reason</strong>
                  <p>{primary?.summary ?? release.runSummary}</p>
                </div>
                <div className="decision-meta">
                  <div className="decision-meta-row"><span>Decision mix</span><span>{decisionCounts(receipt)}</span></div>
                  <div className="decision-meta-row"><span>Run completed</span><span>{formatTimestamp(release.completedAt)}</span></div>
                </div>
              </div>
              <EvidencePath decision={release.overallDecision} />
            </div>
          </section>

          <div className="receipt-section-stack">
            {primary ? (
              <>
                <div className="evidence-grid">
                  <RepositoryEvidenceCard evidence={primary.repositoryEvidence} />
                  <TelegraphEvidenceCard evidence={primary.telegraphEvidence} requests={telegraphRequests} />
                </div>
                <PolicyEvaluation decision={primary} />
                <OtherDecisions decisions={otherDecisions} />
              </>
            ) : (
              <ZeroDecisionState receipt={receipt} />
            )}
            <ReceiptProvenance receipt={receipt} />
          </div>
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}

type ReceiptErrorKind = "not_found" | "revoked" | "error" | "invalid";

export function ReceiptErrorState({ kind }: { kind: ReceiptErrorKind }) {
  if (kind === "error") {
    return (
      <section className="system-state" role="alert">
        <p className="eyebrow">System error</p>
        <h1>Limen couldn&apos;t retrieve this public receipt right now.</h1>
        <p>No release decision has been inferred from this failure.</p>
        <div className="state-actions">
          <Link className="button button-secondary" href="/proof">Try another receipt <ArrowLeft aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  if (kind === "revoked") {
    return (
      <section className="system-state revoked-state" role="alert">
        <p className="eyebrow">Receipt revoked</p>
        <h1>RECEIPT REVOKED</h1>
        <p>This receipt was previously published but is no longer presented as active release evidence.</p>
        <div className="state-actions">
          <Link className="button button-primary" href="/proof">Inspect another receipt <ArrowLeft aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="system-state not-found-state" role="alert">
      <p className="eyebrow">Public lookup</p>
      <h1>RECEIPT NOT FOUND</h1>
      <p>No public Limen receipt exists for this ID.</p>
      <p>The receipt may never have been published, or the ID may be incorrect.</p>
      <div className="state-actions">
        <Link className="button button-primary" href="/proof">Try another receipt <ArrowLeft aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
