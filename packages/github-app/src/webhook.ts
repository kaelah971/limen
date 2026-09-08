import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGitHubWebhookSignature(
  rawBody: Buffer | Uint8Array,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (secret.length === 0 || signature === null || signature === undefined) {
    return false;
  }
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const digest = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(digest)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
