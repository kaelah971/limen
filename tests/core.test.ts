import { describe, expect, it } from "vitest";
import {
  TelegraphPaymentError,
  normalizeSeverity,
  redactSecrets,
  serializeError,
} from "../packages/core/src";

describe("normalizeSeverity", () => {
  it.each([
    ["critical", "CRITICAL"],
    ["Critical", "CRITICAL"],
    ["HIGH", "HIGH"],
    ["medium", "MEDIUM"],
    ["garbage", "UNKNOWN"],
    [null, "UNKNOWN"],
  ])("normalizes %j to %s", (value, expected) => {
    expect(normalizeSeverity(value)).toBe(expected);
  });
});

describe("redaction", () => {
  it("removes secrets but preserves safe provenance", () => {
    const redacted = redactSecrets({
      privateKey: "private-key-value",
      paymentSignature: "payment-signature-value",
      paymentProof: "payment-proof-value",
      authorization: "Bearer credential-value",
      miner_id: "miner-42",
      miner_name: "Evidence Miner",
      intent: "CVE_LOOKUP",
      costUsd: 0.01,
      durationMs: 985,
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("private-key-value");
    expect(serialized).not.toContain("payment-signature-value");
    expect(serialized).not.toContain("payment-proof-value");
    expect(serialized).not.toContain("credential-value");
    expect(serialized).toContain("miner-42");
    expect(serialized).toContain("Evidence Miner");
    expect(serialized).toContain("CVE_LOOKUP");
    expect(serialized).toContain("0.01");
    expect(serialized).toContain("985");
  });

  it("redacts sensitive values from serialized errors", () => {
    const error = new TelegraphPaymentError(
      "payment signature=payment-signature-value",
      {
        paymentProof: "payment-proof-value",
        miner_id: "miner-42",
      },
    );

    const serialized = JSON.stringify(serializeError(error));
    expect(serialized).not.toContain("payment-signature-value");
    expect(serialized).not.toContain("payment-proof-value");
    expect(serialized).toContain("miner-42");
    expect(serialized).toContain("TELEGRAPH_PAYMENT_ERROR");
  });
});
