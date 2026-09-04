import type { Metadata } from "next";
import { LimenFooter, LimenHeader, PageFrame } from "@/app/components/brand";
import { ReceiptDetail, ReceiptErrorState } from "@/app/components/receipt-surface";
import { ReceiptIdParamSchema } from "@/packages/receipts/src/schemas";
import { fetchPublicReceipt } from "@/app/lib/receipt-api";
import { getPageMetadata } from "@/app/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const validId = ReceiptIdParamSchema.safeParse(id).success;
  return {
    ...getPageMetadata(
      `Receipt ${validId ? id : "lookup"}`,
      "Public Limen release evidence receipt.",
      `/receipt/${encodeURIComponent(id)}`,
    ),
    ...(validId ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchPublicReceipt(id);

  if (result.status === "active") {
    return <ReceiptDetail receipt={result.receipt} />;
  }

  const errorKind = result.status;

  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main">
        <div className="content-container">
          <ReceiptErrorState kind={errorKind} />
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
