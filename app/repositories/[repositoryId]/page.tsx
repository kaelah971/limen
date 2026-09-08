import { LimenFooter, LimenHeader, PageFrame } from "../../components/brand";
import { getPublicReceiptApiUrl } from "../../lib/receipt-api";
import { parsePositiveSafeInteger } from "../../lib/limen-api";
import { getPageMetadata } from "../../lib/metadata";
import { RepositoryClient } from "./repository-client";

export const dynamic = "force-dynamic";

export const metadata = getPageMetadata(
  "Repository control",
  "Review Limen setup and release integration state for a connected repository.",
  "/repositories",
);

function InvalidRepositoryState() {
  return (
    <section className="system-state not-found-state" role="alert">
      <p className="eyebrow">Repository lookup</p>
      <h1>REPOSITORY NOT FOUND</h1>
      <p>No connected Limen repository exists for this address.</p>
    </section>
  );
}

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const { repositoryId: repositoryIdValue } = await params;
  const repositoryId = parsePositiveSafeInteger(repositoryIdValue);
  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main setup-page">
        <div className="content-container">
          {repositoryId === null ? (
            <InvalidRepositoryState />
          ) : (
            <RepositoryClient
              apiBaseUrl={getPublicReceiptApiUrl()}
              repositoryId={repositoryId}
            />
          )}
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
