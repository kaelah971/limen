import { LimenFooter, LimenHeader, PageFrame } from "@/app/components/brand";
import { ReceiptLookupForm } from "@/app/components/receipt-lookup-form";
import { getPageMetadata } from "@/app/lib/metadata";

export const metadata = getPageMetadata(
  "Inspect proof",
  "Inspect a public Limen release evidence receipt.",
  "/proof",
);

export default function ProofPage() {
  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main">
        <div className="content-container">
          <header className="page-heading">
            <p className="eyebrow">Public release evidence</p>
            <h1>Inspect a Limen receipt.</h1>
            <p>Enter a public receipt ID to inspect the release decision, evidence path, and provenance behind it.</p>
          </header>
          <div className="lookup-layout">
            <ReceiptLookupForm />
            <aside className="lookup-note">
              Public receipts show a sanitized evidence projection. <strong>Private ledger records are not exposed here.</strong>
            </aside>
          </div>
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
