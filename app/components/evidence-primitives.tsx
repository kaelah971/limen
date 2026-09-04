import type {
  LimenEvidenceReceipt,
  PublicReceiptTelegraphRequest,
} from "@/packages/receipts/src/types";
import Link from "next/link";
import { formatCurrency, formatEvidenceList, formatEvidenceValue, formatTimestamp } from "@/app/lib/receipt-view";
import { ArrowUpRight } from "lucide-react";
import { CopyableCode } from "./copy-button";
import { ContextTag, type DecisionState } from "./decision-badge";

export function EvidenceField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  const displayValue = formatEvidenceValue(value);
  return (
    <div className="evidence-record">
      <dt>{label}</dt>
      <dd className={`${mono ? "" : "not-available"} ${displayValue === "Not available" ? "not-available" : ""}`}>
        {displayValue}
      </dd>
    </div>
  );
}

export function EvidenceListField({
  label,
  value,
}: {
  label: string;
  value: string[] | null | undefined;
}) {
  const displayValue = formatEvidenceList(value);
  return (
    <div className="evidence-record">
      <dt>{label}</dt>
      <dd className={displayValue === "Not available" ? "not-available" : ""}>{displayValue}</dd>
    </div>
  );
}

export function EvidenceCard({
  source,
  title,
  caption,
  children,
}: {
  source: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="evidence-card">
      <div className="card-header">
        <div>
          <p className="source-label">{source}</p>
          <h2>{title}</h2>
          {caption ? <p className="card-caption">{caption}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EvidencePath({ decision }: { decision: DecisionState }) {
  const stages = [
    ["REPOSITORY", "Context and exposure"],
    ["TELEGRAPH", "Routed CVE signal"],
    ["POLICY", "Declared release rule"],
    ["DECISION", decision],
  ] as const;
  return (
    <div className="path-block" role="group" aria-label="Evidence path: repository to Telegraph to policy to decision">
      <p className="path-label">Evidence path</p>
      <div className="evidence-path">
        {stages.map(([name, description]) => (
          <div className="path-stage" key={name}>
            <span className="path-marker" aria-hidden="true" />
            <strong>{name}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvidenceMesh() {
  const stages = [
    ["Repository", "facts"],
    ["Telegraph", "route"],
    ["x402", "request"],
    ["Policy", "threshold"],
    ["Decision", "PASS / HOLD / REVIEW"],
    ["Receipt", "provenance"],
  ] as const;
  return (
    <div className="evidence-mesh" role="group" aria-label="Evidence Mesh: repository facts to Telegraph route to paid request to policy to decision to receipt">
      <div className="mesh-fade-stack" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="mesh-side-card mesh-side-card-left" aria-hidden="true">REPOSITORY</div>
      <div className="mesh-side-card mesh-side-card-right" aria-hidden="true">RECEIPT</div>
      <div className="mesh-connector" aria-hidden="true" />
      <div className="mesh-items">
        {stages.map(([name, description]) => (
          <div className="mesh-item" key={name}>
            <span className="mesh-tile" aria-hidden="true"><span className="mesh-tile-name">{name}</span></span>
            <span className="mesh-node" aria-hidden="true" />
            <span className="mesh-label"><strong>{name}</strong><br />{description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  const content = <>{children}<ArrowUpRight aria-hidden="true" /></>;
  return /^https?:\/\//i.test(href) ? (
    <a className="trace-link" href={href} target="_blank" rel="noreferrer noopener">
      {content}
    </a>
  ) : (
    <Link className="trace-link" href={href}>
      {content}
    </Link>
  );
}

export function TelegraphRequestList({ requests }: { requests: PublicReceiptTelegraphRequest[] }) {
  return (
    <div className="request-list" aria-label="Telegraph request records">
      {requests.map((request) => (
        <details className="request-row" key={`${request.cveId}-${request.receivedAt ?? "unknown"}`}>
          <summary>
            <span className="request-summary-main">
              <code>{request.cveId}</code>
              <span className={`request-outcome request-outcome-${request.outcome}`}>{request.outcome.toUpperCase()}</span>
            </span>
            <span className="request-summary-meta">
              {formatCurrency(request.costUsd)} / {formatEvidenceValue(request.durationMs)} ms
            </span>
          </summary>
          <div className="request-details">
            <EvidenceField label="Intent" value={request.intent} />
            <EvidenceField label="Miner" value={request.minerName} />
            <EvidenceField label="Cost" value={formatCurrency(request.costUsd)} />
            <EvidenceField label="Latency" value={request.durationMs === null ? null : `${request.durationMs} ms`} />
            <EvidenceField label="Network" value={request.network} />
            <EvidenceField label="Payment" value={request.paymentScheme} />
            <EvidenceField label="Requested" value={formatTimestamp(request.requestedAt)} />
            <EvidenceField label="Received" value={formatTimestamp(request.receivedAt)} />
          </div>
        </details>
      ))}
    </div>
  );
}

export function ReceiptProvenance({ receipt }: { receipt: LimenEvidenceReceipt }) {
  const { release } = receipt.snapshot;
  return (
    <section className="receipt-provenance">
      <div className="provenance-header">
        <div>
          <p className="source-label">Receipt / provenance</p>
          <h2>Share the decision without the private ledger.</h2>
        </div>
        <div className="context-tags">
          <ContextTag>{release.usageClass}</ContextTag>
          <ContextTag>{release.source}</ContextTag>
        </div>
      </div>
      <div className="provenance-records">
        <div className="provenance-record">
          <span>Receipt ID</span>
          <div><CopyableCode value={receipt.id} label="receipt ID" /></div>
        </div>
        <div className="provenance-record">
          <span>Schema</span>
          <div><code className="evidence-value">{receipt.schemaVersion}</code></div>
        </div>
        <div className="provenance-record">
          <span>Snapshot SHA-256</span>
          <div><CopyableCode value={receipt.snapshotHash} label="snapshot hash" /></div>
        </div>
        <div className="provenance-record">
          <span>Policy version</span>
          <div><code className="evidence-value">{release.policyVersion}</code></div>
        </div>
        <div className="provenance-record">
          <span>Published</span>
          <div><code className="evidence-value">{receipt.publishedAt}</code></div>
        </div>
      </div>
      <p className="provenance-disclaimer">
        This receipt is a public projection of Limen&apos;s durable evidence record. Private ledger data and credentials are not exposed here.
      </p>
    </section>
  );
}
