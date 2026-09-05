import { describe, expect, it } from "vitest";
import {
  TelegraphCveEvidenceSchema,
} from "../packages/core/src";
import { normalizeTelegraphEvidence } from "../packages/telegraph/src";

const context = {
  requestedAt: "2026-09-02T10:00:00.000Z",
  receivedAt: "2026-09-02T10:00:00.985Z",
  payment: {
    network: "eip155:84532",
    scheme: "exact",
    costUsd: 0.01,
  },
};

describe("normalizeTelegraphEvidence", () => {
  it("normalizes a complete routed result", () => {
    const evidence = normalizeTelegraphEvidence(
      {
        intent: "CVE_LOOKUP",
        cve_id: "CVE-2021-23337",
        result: {
          cve_id: "CVE-2021-23337",
          severity: "high",
          cvss: { baseScore: 7.2 },
          description: "A vulnerability description.",
          references: ["https://example.com/advisory"],
          affected_versions: ["<4.17.21"],
          fixed_versions: ["4.17.21"],
          fix_available: true,
        },
        miner_used: "miner-42",
        miner_name: "Evidence Miner",
        cost_usd: "0.01",
        duration_ms: 985,
        timestamp: "2026-09-02T10:00:00.900Z",
        reasoning: "The routed Miner matched the requested CVE.",
        endpoint: "https://miner.example.test/cve",
        provider_specific_field: { retained: true },
      },
      context,
    );

    expect(evidence).toMatchObject({
      cveId: "CVE-2021-23337",
      severity: "HIGH",
      cvssScore: 7.2,
      references: ["https://example.com/advisory"],
      affectedVersions: ["<4.17.21"],
      fixedVersions: ["4.17.21"],
      fixAvailable: true,
      intent: "CVE_LOOKUP",
      minerId: "miner-42",
      minerName: "Evidence Miner",
      timestamp: "2026-09-02T10:00:00.900Z",
      reasoning: "The routed Miner matched the requested CVE.",
      endpoint: "https://miner.example.test/cve",
      costUsd: 0.01,
      durationMs: 985,
      network: "eip155:84532",
      paymentScheme: "exact",
    });
    expect(evidence.requestedAt).toBe("2026-09-02T10:00:00.000Z");
    expect(evidence.raw).toMatchObject({
      provider_specific_field: { retained: true },
    });
    expect(TelegraphCveEvidenceSchema.safeParse(evidence).success).toBe(true);
  });

  it("represents historical evidence with an unknown request time", () => {
    const evidence = normalizeTelegraphEvidence(null, context);
    const historicalEvidence = { ...evidence, requestedAt: null };

    expect(TelegraphCveEvidenceSchema.safeParse(historicalEvidence).success).toBe(true);
  });

  it("keeps missing optional evidence explicit", () => {
    const evidence = normalizeTelegraphEvidence(
      {
        intent: "CVE_LOOKUP",
        result: {
          cve_id: "CVE-2021-23337",
          severity: null,
          cvss: null,
          references: null,
          affected_versions: null,
          fixed_versions: null,
          miner: null,
        },
        metadata: null,
      },
      context,
    );

    expect(evidence.severity).toBeNull();
    expect(evidence.cvssScore).toBeNull();
    expect(evidence.references).toEqual([]);
    expect(evidence.affectedVersions).toBeNull();
    expect(evidence.fixedVersions).toBeNull();
    expect(evidence.fixAvailable).toBeNull();
    expect(evidence.minerId).toBeNull();
    expect(evidence.minerName).toBeNull();
  });

  it("normalizes malformed severity and CVE identity conservatively", () => {
    const evidence = normalizeTelegraphEvidence(
      {
        result: {
          cve_id: "not-a-cve",
          severity: "new-provider-severity",
        },
      },
      context,
    );

    expect(evidence.cveId).toBeNull();
    expect(evidence.severity).toBe("UNKNOWN");
  });

  it("does not merge conflicting CVE identities", () => {
    const evidence = normalizeTelegraphEvidence(
      {
        cve_id: "CVE-2021-23337",
        result: { cve_id: "CVE-2024-0001" },
      },
      context,
    );

    expect(evidence.cveId).toBeNull();
  });

  it("rejects conflicting severity fields instead of trusting the first value", () => {
    expect(() => normalizeTelegraphEvidence(
      {
        intent: "CVE_LOOKUP",
        severity: "HIGH",
        result: { severity: "LOW" },
      },
      context,
    )).toThrow("conflicting severity values");
  });

  it("handles null responses as unknown evidence and rejects non-object responses", () => {
    const emptyEvidence = normalizeTelegraphEvidence(null, context);
    expect(emptyEvidence.cveId).toBeNull();
    expect(emptyEvidence.references).toEqual([]);

    expect(() => normalizeTelegraphEvidence("malformed", context)).toThrow(
      "not an object",
    );
  });
});
