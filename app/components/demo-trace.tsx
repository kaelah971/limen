import Link from "next/link";
import type { PublicReceiptDecision } from "@/packages/receipts/src/types";
import type { PublicReceiptResult } from "@/app/lib/receipt-api";
import { ACTIVE_HOLD_RECEIPT_ID, DEMO_HOLD_ACTION_URL, DEMO_PASS_ACTION_URL, DEMO_PASS_SUMMARY, DEMO_POLICY, DEMO_PULL_REQUEST_URL, DEMO_REPOSITORY } from "@/app/lib/demo-data";
import { formatCurrency, formatEvidenceValue, getPrimaryDecision } from "@/app/lib/receipt-view";
import { ArrowUpRight } from "lucide-react";
import { ContextTag, DecisionBadge } from "./decision-badge";
import { SourceLink } from "./evidence-primitives";
import { ReceiptErrorState } from "./receipt-surface";

function TraceRecord({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="trace-record">
      <span>{label}</span>
      <span>{formatEvidenceValue(value)}</span>
    </div>
  );
}

function DecisionRows({ decisions }: { decisions: PublicReceiptDecision[] }) {
  return (
    <div className="trace-cve-list" aria-label="Workflow decisions">
      {decisions.map((decision) => (
        <div className="trace-cve-row" key={decision.cveId}>
          <code>{decision.cveId}</code>
          <DecisionBadge decision={decision.decision} />
        </div>
      ))}
    </div>
  );
}

export function DemoTrace({ result }: { result: PublicReceiptResult }) {
  if (result.status !== "active") {
    return <ReceiptErrorState kind={result.status === "error" ? "error" : result.status === "revoked" ? "revoked" : "not_found"} />;
  }

  const receipt = result.receipt;
  const release = receipt.snapshot.release;
  const primary = getPrimaryDecision(receipt);
  const repositoryEvidence = primary?.repositoryEvidence;
  const telegraphEvidence = primary?.telegraphEvidence;
  const decisions = receipt.snapshot.decisions;
  const requests = receipt.snapshot.telegraphRequests;
  const repository = release.repository;
  const policyVersion = release.policyVersion;
  const baseSha = release.baseSha;
  const headSha = release.headSha;
  const receiptId = receipt.id;
  const receiptHash = receipt.snapshotHash;
  const cveIds = release.evaluatedCves;
  const reviewDecision = decisions.find((decision) => decision.decision === "REVIEW");
  const hasReview = reviewDecision !== undefined;

  return (
    <>
      <div className="demo-trace">
        <section className="trace-step">
          <div className="trace-marker">01</div>
          <div className="trace-content">
            <p className="source-label">Pull request</p>
            <h2>The proposed release enters the gate.</h2>
            <p>Policy is read from the trusted base revision. The proposed dependency state is evaluated from the pull request head.</p>
            <div className="trace-records">
              <TraceRecord label="Repository" value={repository} />
              <TraceRecord label="Pull request" value={`#${release.pullRequestNumber}`} />
              <TraceRecord label="Base SHA" value={baseSha} />
              <TraceRecord label="HOLD head SHA" value={headSha} />
            </div>
            <SourceLink href={DEMO_PULL_REQUEST_URL}>View source pull request</SourceLink>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">02</div>
          <div className="trace-content">
            <p className="source-label">GitHub / Dependency Review</p>
            <h2>Repository evidence names the change.</h2>
            <p>Repository context establishes the package, version, relationship and runtime scope before outside evidence is considered.</p>
            <div className="trace-records">
              <TraceRecord label="Package" value={repositoryEvidence?.packageName} />
              <TraceRecord label="Installed" value={repositoryEvidence?.installedVersion} />
              <TraceRecord label="Scope" value={repositoryEvidence?.scope} />
              <TraceRecord label="Relationship" value={repositoryEvidence?.relationship} />
              <TraceRecord label="Manifest" value={repositoryEvidence?.manifestPath} />
              <TraceRecord label="CVE" value={repositoryEvidence?.cveId} />
            </div>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">03</div>
          <div className="trace-content">
            <p className="source-label">Telegraph / CVE_LOOKUP</p>
            <h2>Relevant CVEs take the routed evidence path.</h2>
            <p>Five real paid requests were made for this controlled workflow. The receipt exposes safe routing metadata, not payment credentials or private provider payloads.</p>
            <div className="trace-records">
              <TraceRecord label="Requests" value={release.telegraphRequestCount} />
              <TraceRecord label="Each request" value="$0.01" />
              <TraceRecord label="Total cost" value={formatCurrency(release.telegraphCostUsd)} />
              <TraceRecord label="Intent" value="CVE_LOOKUP" />
            </div>
            <div className="trace-cve-list" aria-label="CVE lookup requests">
              {cveIds.map((cveId) => {
                const request = requests.find((item) => item.cveId === cveId);
                return (
                  <div className="trace-cve-row" key={cveId}>
                    <code>{cveId}</code>
                    <span className="mono">{formatCurrency(request?.costUsd)}</span>
                  </div>
                );
              })}
            </div>
            <div className="trace-callout">
              <strong>{formatEvidenceValue(telegraphEvidence?.cveId)}</strong>{" "}
              returned <strong>{formatEvidenceValue(telegraphEvidence?.severity)}</strong> severity with CVSS {formatEvidenceValue(telegraphEvidence?.cvssScore)}. Routed provenance: <strong>{formatEvidenceValue(telegraphEvidence?.minerName)}</strong>, {formatEvidenceValue(telegraphEvidence?.durationMs)} ms, {formatEvidenceValue(telegraphEvidence?.network)}, x402 <strong>{formatEvidenceValue(telegraphEvidence?.paymentScheme)}</strong>.
            </div>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">04</div>
          <div className="trace-content">
            <p className="source-label">Limen policy</p>
            <h2>The repository rule sets the threshold.</h2>
            <p>The declared policy blocks high and critical findings in runtime scope. Uncertainty goes to REVIEW.</p>
            <div className="trace-records">
              <TraceRecord label="Policy version" value={policyVersion} />
              <TraceRecord label="Block severity" value={DEMO_POLICY.blockedSeverities} />
              <TraceRecord label="Dependency scope" value={DEMO_POLICY.dependencyScopes} />
              <TraceRecord label="Uncertainty" value={DEMO_POLICY.uncertainty} />
            </div>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">05</div>
          <div className="trace-content">
            <p className="source-label">Decision engine</p>
            <h2>The same evidence produces explicit states.</h2>
            <p>Limen aggregates outcomes with the supported precedence <code>HOLD &gt; REVIEW &gt; PASS</code>. It does not silently choose one source when material evidence conflicts.</p>
            <DecisionRows decisions={decisions} />
            {hasReview && reviewDecision ? (
              <div className="trace-callout">
                <strong>{reviewDecision.cveId}</strong> shows GitHub <strong>{formatEvidenceValue(reviewDecision.repositoryEvidence.severity)}</strong> and Telegraph <strong>{formatEvidenceValue(reviewDecision.telegraphEvidence?.severity)}</strong>. Result: <strong>REVIEW</strong>.
              </div>
            ) : null}
            <div className="trace-callout">
              Overall result: <strong>{release.overallDecision}</strong>. The primary condition is the affected runtime dependency matching a blocking policy rule.
            </div>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">06</div>
          <div className="trace-content">
            <p className="source-label">GitHub result</p>
            <h2>The release check carries the consequence.</h2>
            <p>The real controlled workflow returned HOLD to GitHub. A blocking release is visible where the change is reviewed.</p>
            <SourceLink href={DEMO_HOLD_ACTION_URL}>Open the real HOLD Action run</SourceLink>
          </div>
        </section>

        <section className="trace-step">
          <div className="trace-marker">07</div>
          <div className="trace-content">
            <p className="source-label">Historical public receipt</p>
            <h2>The decision leaves a receipt.</h2>
            <p>This historical public receipt is a sanitized projection of the durable evidence record. It is separate from the fresh P14 Judge Mode Action runs above.</p>
            <div className="trace-records">
              <TraceRecord label="Receipt" value={receiptId} />
              <TraceRecord label="Schema" value="limen.receipt.v1" />
              <TraceRecord label="Snapshot hash" value={receiptHash} />
              <TraceRecord label="Classification" value={`${release.usageClass} / ${release.source}`} />
            </div>
            <Link className="trace-link" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
              Inspect the historical HOLD receipt <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      <section className="section" aria-labelledby="patched-path-heading">
        <div className="section-heading">
          <p className="section-kicker">Patched path</p>
          <h2 id="patched-path-heading">The same gate can pass a changed release.</h2>
          <p>A separate controlled run used Lodash {DEMO_PASS_SUMMARY.packageVersion} and returned PASS with no relevant decisions.</p>
        </div>
        <div className="proof-card">
          <div className="proof-card-header">
            <div>
              <p className="source-label">GitHub Action</p>
              <h3><code>{DEMO_REPOSITORY}</code></h3>
            </div>
            <DecisionBadge decision="PASS" />
          </div>
          <div className="proof-main">
            <dl className="proof-evidence-list">
              <div className="proof-evidence-row"><dt>Package</dt><dd>lodash@{DEMO_PASS_SUMMARY.packageVersion}</dd></div>
              <div className="proof-evidence-row"><dt>Decision</dt><dd>Evidence supports proceeding under policy.</dd></div>
              <div className="proof-evidence-row"><dt>Relevant decisions</dt><dd>{DEMO_PASS_SUMMARY.decisionCount}</dd></div>
            </dl>
            <div className="proof-stat-panel">
              <div className="proof-stat"><span className="proof-stat-label">Telegraph requests</span><strong className="proof-stat-value">{DEMO_PASS_SUMMARY.telegraphRequestCount}</strong></div>
              <div className="proof-stat"><span className="proof-stat-label">Routing cost</span><strong className="proof-stat-value">{formatCurrency(DEMO_PASS_SUMMARY.telegraphCostUsd)}</strong></div>
              <ContextTag>Demo / backfill</ContextTag>
            </div>
          </div>
          <SourceLink href={DEMO_PASS_ACTION_URL}>Open the real PASS Action run</SourceLink>
          <p className="small-note">A PASS receipt was intentionally revoked during receipt lifecycle validation. It is not presented as active proof.</p>
        </div>
      </section>

      <section className="section section-muted" aria-labelledby="validation-checklist-heading">
        <div className="section-heading">
          <p className="section-kicker">Validation checklist</p>
          <h2 id="validation-checklist-heading">One trace, with its limits visible.</h2>
        </div>
        <ul className="checklist">
          <li>Real GitHub pull request evidence</li>
          <li>Real Dependency Review context</li>
          <li>Real paid Telegraph CVE_LOOKUP</li>
          <li>Separately validated x402 Base Sepolia settlement</li>
          <li>Deterministic policy evaluation</li>
          <li>Real HOLD GitHub result</li>
          <li>Durable hosted evidence ledger</li>
          <li>Public shareable receipt</li>
          <li>Receipt revocation lifecycle</li>
        </ul>
        <p className="demo-caveat">This is controlled demo validation. It is not a claim of production adoption or external user usage.</p>
      </section>
    </>
  );
}
