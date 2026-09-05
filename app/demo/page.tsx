import type { Metadata } from "next";
import Link from "next/link";
import { LimenFooter, LimenHeader, PageFrame } from "@/app/components/brand";
import { DemoTrace } from "@/app/components/demo-trace";
import { ContextTag } from "@/app/components/decision-badge";
import { fetchPublicReceipt } from "@/app/lib/receipt-api";
import { ACTIVE_HOLD_RECEIPT_ID, DEMO_POLICY_VERSION, DEMO_REPOSITORY, DEMO_PULL_REQUEST_URL } from "@/app/lib/demo-data";
import { ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo workflow",
  description: "Follow a controlled Limen release decision from pull request to historical public receipt.",
};

export default async function DemoPage() {
  const receiptResult = await fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID);

  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main demo-page">
        <div className="content-container">
          <header className="demo-heading">
            <div>
              <p className="eyebrow">Live validated workflow</p>
              <h1>One release. One evidence path.</h1>
              <p>Follow a real Limen decision from pull request to historical public receipt.</p>
            </div>
            <div className="demo-actions">
              <a className="button button-secondary" href={DEMO_PULL_REQUEST_URL} target="_blank" rel="noreferrer noopener">
                View source pull request <ArrowUpRight aria-hidden="true" />
              </a>
              <Link className="button button-primary" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>
                Inspect historical receipt <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </header>
          <div className="metadata-strip" aria-label="Controlled workflow metadata">
            <div className="metadata-item"><span>Repository</span><span>{DEMO_REPOSITORY}</span></div>
            <div className="metadata-item"><span>Pull request</span><span>#1</span></div>
            <div className="metadata-item"><span>Environment</span><span>controlled demo</span></div>
            <div className="metadata-item"><span>Network</span><span>Base Sepolia</span></div>
            <div className="metadata-item"><span>Policy</span><span>{DEMO_POLICY_VERSION}</span></div>
          </div>
          <div className="context-tags demo-tags">
            <ContextTag>CVE_LOOKUP</ContextTag>
            <ContextTag>demo / backfill</ContextTag>
          </div>
          <DemoTrace result={receiptResult} />
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
