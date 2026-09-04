import {
  ReceiptIdParamSchema,
  ReceiptSchema,
} from "../../packages/receipts/src/schemas";
import { hashReceiptSnapshot } from "../../packages/receipts/src/hash";
import type { LimenEvidenceReceipt } from "../../packages/receipts/src/types";

export type PublicReceiptResult =
  | { status: "active"; receipt: LimenEvidenceReceipt }
  | { status: "not_found" }
  | { status: "revoked" }
  | { status: "invalid" }
  | { status: "error" };

const DEFAULT_PUBLIC_API_URL = "http://127.0.0.1:8787";

export function getPublicReceiptApiUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  return environment.LIMEN_PUBLIC_API_URL?.trim().replace(/\/+$/, "") || DEFAULT_PUBLIC_API_URL;
}

export async function fetchPublicReceipt(
  receiptId: string,
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
): Promise<PublicReceiptResult> {
  if (!ReceiptIdParamSchema.safeParse(receiptId).success) {
    return { status: "invalid" };
  }

  try {
    const response = await fetcher(
      `${getPublicReceiptApiUrl(environment)}/v1/receipts/${encodeURIComponent(receiptId)}`,
      {
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );

    if (response.status === 404) {
      return { status: "not_found" };
    }
    if (response.status === 410) {
      return { status: "revoked" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const parsed = ReceiptSchema.safeParse(await response.json() as unknown);
    return parsed.success && hashReceiptSnapshot(parsed.data.snapshot) === parsed.data.snapshotHash
      ? { status: "active", receipt: parsed.data }
      : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
