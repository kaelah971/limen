import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LimenFooter, LimenHeader, PageFrame } from "@/app/components/brand";
import { ContextTag, DecisionBadge } from "@/app/components/decision-badge";
import { EvidenceMesh, SourceLink } from "@/app/components/evidence-primitives";
import {
  ACTIVE_HOLD_RECEIPT_ID,
  DEMO_HOLD_SUMMARY,
  DEMO_PRIMARY_EVIDENCE,
  DEMO_REPOSITORY,
} from "@/app/lib/demo-data";
import { formatCurrency } from "@/app/lib/receipt-view";

const workflowSteps = [
  ["01", "Pull request opens", "The release change establishes the context to evaluate."],
  ["02", "Read repository evidence", "GitHub and Dependency Review identify the relevant package facts."],
  ["03", "Route relevant CVEs", "Telegraph receives a paid CVE_LOOKUP request when evidence is needed."],
  ["04", "Apply limen.yml", "The repository policy compares source-specific evidence against its rules."],
  ["05", "Return the state", "PASS, HOLD or REVIEW returns to the GitHub workflow."],
  ["06", "Leave a decision record", "The evidence path becomes durable and may be published as a receipt."],
];

export default function Home() {
  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main">
        <section className="hero">
          <div className="hero-inner">
            <p className="eyebrow">Release evidence gate</p>
            <h1>
              <span>LET EVIDENCE SET</span>
              <span className="threshold-line">THE THRESHOLD.</span>
            </h1>
            <p className="hero-copy">
              Repository facts + independently routed CVE evidence, evaluated against the policy your release already lives by.
            </p>
            <p className="hero-support">
              Limen turns evidence into a deterministic PASS, HOLD, or REVIEW before code leaves the repository.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
                Inspect real proof <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" href="/demo">
                See how it works <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="proof-row" aria-label="Limen evidence integrations">
              <span>GitHub</span>
              <span>Dependabot</span>
              <span>Telegraph</span>
              <span>Base Sepolia</span>
            </div>
            <div className="mesh-wrap">
              <EvidenceMesh />
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="problem-heading">
          <div className="content-container problem-grid">
            <div>
              <p className="section-kicker">The release threshold</p>
              <h2 id="problem-heading">Your CI knows whether the tests passed.</h2>
            </div>
            <div className="body-copy">
              <p>It doesn&apos;t know whether the release has enough evidence to proceed.</p>
              <p>A scanner can identify a vulnerability. A CVE source can provide vulnerability facts. Neither alone answers whether this specific repository release should proceed.</p>
              <p className="threshold-callout">Limen sits at that threshold.</p>
            </div>
          </div>
        </section>

        <section className="section section-muted" aria-labelledby="roles-heading">
          <div className="content-container">
            <div className="section-heading">
              <p className="section-kicker">One decision, distinct roles</p>
              <h2 id="roles-heading">Each source answers the question it can actually know.</h2>
              <p>Repository context, routed CVE evidence and release policy stay visible without becoming one opaque signal.</p>
            </div>
            <div className="role-grid">
              <article className="role-card">
                <span className="role-label">01 / Repository facts</span>
                <h3>GitHub / Dependency Review / Dependabot</h3>
                <p>Package identity, installed version, vulnerable range, manifest, scope and relationship in this repository.</p>
              </article>
              <article className="role-card">
                <span className="role-label">02 / Routed CVE evidence</span>
                <h3>Telegraph / CVE_LOOKUP</h3>
                <p>A separately routed signal with provenance, cost, latency and the evidence fields it returned.</p>
              </article>
              <article className="role-card">
                <span className="role-label">03 / Release policy</span>
                <h3><code>limen.yml</code></h3>
                <p>The repository declares what blocks a release and what uncertainty must go to human review.</p>
              </article>
            </div>
            <div className="outcome-strip">
              <p>The result is explicit, not implied.</p>
              <div className="outcome-states">
                <DecisionBadge decision="PASS" />
                <DecisionBadge decision="HOLD" />
                <DecisionBadge decision="REVIEW" />
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="real-proof-heading">
          <div className="content-container">
            <div className="section-heading">
              <p className="section-kicker">Real proof</p>
              <h2 id="real-proof-heading">A controlled release crossed the threshold and stopped.</h2>
              <p>Inspect the public receipt for the full sanitized evidence path.</p>
            </div>
            <div className="proof-card">
              <div className="proof-card-header">
                <div>
                  <p className="source-label">HOLD / {DEMO_REPOSITORY}</p>
                  <h3><code>PR #1</code> · lodash@{DEMO_PRIMARY_EVIDENCE.installedVersion}</h3>
                </div>
                <DecisionBadge decision="HOLD" />
              </div>
              <div className="proof-main">
                <dl className="proof-evidence-list">
                  <div className="proof-evidence-row"><dt>Blocking CVE</dt><dd>{DEMO_PRIMARY_EVIDENCE.cveId}</dd></div>
                  <div className="proof-evidence-row"><dt>GitHub severity</dt><dd>{DEMO_PRIMARY_EVIDENCE.severity}</dd></div>
                  <div className="proof-evidence-row"><dt>Telegraph severity</dt><dd>{DEMO_PRIMARY_EVIDENCE.severity}</dd></div>
                  <div className="proof-evidence-row"><dt>CVSS</dt><dd>{DEMO_PRIMARY_EVIDENCE.cvssScore}</dd></div>
                  <div className="proof-evidence-row"><dt>Policy</dt><dd>HIGH is blocking in runtime scope</dd></div>
                  <div className="proof-evidence-row"><dt>Next action</dt><dd>Update the dependency to a version that clears all blocking findings under the current policy.</dd></div>
                </dl>
                <div className="proof-stat-panel">
                  <div className="proof-stat"><span className="proof-stat-label">Miner</span><strong className="proof-stat-value">{DEMO_PRIMARY_EVIDENCE.minerName}</strong></div>
                  <div className="proof-stat"><span className="proof-stat-label">Request</span><strong className="proof-stat-value">{formatCurrency(DEMO_PRIMARY_EVIDENCE.costUsd)} / {DEMO_PRIMARY_EVIDENCE.durationMs} ms</strong></div>
                  <div className="proof-stat"><span className="proof-stat-label">Workflow</span><strong className="proof-stat-value">{DEMO_HOLD_SUMMARY.telegraphRequestCount} routed lookups</strong></div>
                  <div className="proof-stat"><span className="proof-stat-label">Total</span><strong className="proof-stat-value">{formatCurrency(DEMO_HOLD_SUMMARY.telegraphCostUsd)}</strong></div>
                  <ContextTag>Demo / backfill</ContextTag>
                </div>
              </div>
              <SourceLink href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>Inspect full public receipt</SourceLink>
            </div>
            <div className="proof-stat-panel proof-summary-strip">
              <div className="proof-stat"><span className="proof-stat-label">Routed CVE lookups</span><strong className="proof-stat-value">{DEMO_HOLD_SUMMARY.telegraphRequestCount}</strong></div>
              <div className="proof-stat"><span className="proof-stat-label">PASS</span><strong className="proof-stat-value">{DEMO_HOLD_SUMMARY.passCount}</strong></div>
              <div className="proof-stat"><span className="proof-stat-label">HOLD</span><strong className="proof-stat-value">{DEMO_HOLD_SUMMARY.holdCount}</strong></div>
              <div className="proof-stat"><span className="proof-stat-label">REVIEW</span><strong className="proof-stat-value">{DEMO_HOLD_SUMMARY.reviewCount}</strong></div>
            </div>
          </div>
        </section>

        <section className="section section-muted" aria-labelledby="states-heading">
          <div className="content-container">
            <div className="section-heading">
              <p className="section-kicker">Three possible states</p>
              <h2 id="states-heading">Not every uncertain release should pass. Not every alert should block.</h2>
            </div>
            <div className="state-grid">
              <article className="state-card">
                <DecisionBadge decision="PASS" />
                <h3>Evidence supports proceeding under policy.</h3>
                <p>Continue the release. PASS is not a universal security guarantee.</p>
              </article>
              <article className="state-card">
                <DecisionBadge decision="HOLD" />
                <h3>Repository evidence matches a blocking policy condition.</h3>
                <p>Stop, patch the dependency or deliberately change the declared policy.</p>
              </article>
              <article className="state-card">
                <DecisionBadge decision="REVIEW" />
                <h3>Evidence is incomplete, conflicting, malformed or unavailable.</h3>
                <p>Investigate the evidence. REVIEW is not a weak PASS.</p>
              </article>
            </div>
            <p className="states-note">In the controlled HOLD workflow, GitHub reports HIGH and Telegraph reports CRITICAL for CVE-2026-4800. Limen returns REVIEW rather than silently choosing one source.</p>
          </div>
        </section>

        <section className="section" id="how-it-works" aria-labelledby="how-heading">
          <div className="content-container">
            <div className="section-heading">
              <p className="section-kicker">How it works</p>
              <h2 id="how-heading">A release check with a visible evidence path.</h2>
            </div>
            <div className="how-it-works">
              {workflowSteps.map(([number, title, description]) => (
                <article className="work-step" key={number}>
                  <span className="work-step-number">{number}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-muted" aria-labelledby="honesty-heading">
          <div className="content-container honesty-grid">
            <div>
              <p className="section-kicker">Architecture honesty</p>
              <h2 id="honesty-heading">The route is useful because the sources stay distinct.</h2>
            </div>
            <div className="quote-panel">
              <p>GitHub establishes repository context. Telegraph supplies separately routed CVE evidence. Limen applies release policy.</p>
              <span>A Telegraph response alone never proves repository exploitability.</span>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="receipt-heading">
          <div className="content-container">
            <div className="receipt-callout">
              <div>
                <p className="section-kicker">Receipt / provenance</p>
                <h2 id="receipt-heading">The decision should still make sense tomorrow.</h2>
                <p>Limen can persist the evidence path and publish a sanitized receipt without exposing the private ledger behind it.</p>
                <code>{ACTIVE_HOLD_RECEIPT_ID}</code>
              </div>
              <Link className="button button-secondary" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
                Inspect receipt <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-heading">
          <div className="content-container">
            <p className="section-kicker">Release evidence gate</p>
            <h2 id="final-heading">Let evidence set the threshold.</h2>
            <div className="hero-actions">
              <Link className="button button-primary" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
                Inspect real proof <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" href="/demo">
                View demo workflow <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <p className="small-note">Controlled demo / Base Sepolia / Telegraph CVE_LOOKUP</p>
          </div>
        </section>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
