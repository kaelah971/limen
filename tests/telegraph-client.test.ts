import { describe, expect, it } from "vitest";
import { TelegraphEngineClient } from "../packages/telegraph/src";
import type {
  TelegraphConfig,
  TelegraphPaymentAdapter,
} from "../packages/telegraph/src";

const config: TelegraphConfig = {
  engineUrl: "https://engine.example.test/v1/ask",
  privateKey: "test-only-placeholder",
  expectedNetwork: "eip155:84532",
  timeoutMs: 5000,
};

function createPaymentAdapter(
  overrides: Partial<Awaited<ReturnType<TelegraphPaymentAdapter["preparePayment"]>>> = {},
): TelegraphPaymentAdapter {
  return {
    preparePayment: async () => ({
      headers: { "PAYMENT-SIGNATURE": "test-signature" },
      network: "eip155:84532",
      scheme: "exact",
      amount: "10000",
      asset: "test-asset",
      costUsd: 0.01,
      ...overrides,
    }),
  };
}

function createClient(
  responses: Response[],
  paymentAdapter: TelegraphPaymentAdapter = createPaymentAdapter(),
) {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (!response) {
      throw new Error("No response fixture available");
    }
    return response;
  };
  const client = new TelegraphEngineClient({
    config,
    fetch: fetchImpl,
    paymentAdapter,
    now: (() => {
      const values = [
        new Date("2026-09-02T10:00:00.000Z"),
        new Date("2026-09-02T10:00:00.985Z"),
      ];
      return () => values.shift() ?? new Date("2026-09-02T10:00:00.985Z");
    })(),
  });
  return { client, calls };
}

describe("TelegraphEngineClient", () => {
  it("performs one challenge request and one paid retry", async () => {
    const { client, calls } = createClient([
      new Response(JSON.stringify({ error: "payment required" }), { status: 402 }),
      new Response(
        JSON.stringify({
          intent: "CVE_LOOKUP",
          cve_id: "CVE-2021-23337",
          severity: "HIGH",
          cvss: 7.2,
          miner_used: "miner-42",
          miner_name: "Evidence Miner",
          duration_ms: 985,
        }),
        { status: 200 },
      ),
    ]);

    const evidence = await client.lookupCve({ cveId: "cve-2021-23337" });

    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      query: "Look up current vulnerability information for CVE-2021-23337",
      context: { cve_id: "CVE-2021-23337" },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).not.toHaveProperty("intent");
    expect(new Headers(calls[1]?.init?.headers).get("PAYMENT-SIGNATURE")).toBe(
      "test-signature",
    );
    expect(evidence).toMatchObject({
      cveId: "CVE-2021-23337",
      severity: "HIGH",
      cvssScore: 7.2,
      minerId: "miner-42",
      minerName: "Evidence Miner",
      costUsd: 0.01,
      durationMs: 985,
    });
  });

  it("does not accept free evidence without an x402 challenge", async () => {
    const { client } = createClient([
      new Response(JSON.stringify({ cve_id: "CVE-2021-23337" }), { status: 200 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_CHALLENGE_ERROR",
    });
  });

  it("rejects a payment prepared for the wrong network", async () => {
    const { client } = createClient(
      [new Response("", { status: 402 })],
      createPaymentAdapter({ network: "eip155:1" }),
    );

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "UNEXPECTED_NETWORK",
    });
  });

  it("does not treat a repeated challenge as a successful paid result", async () => {
    const { client } = createClient([
      new Response("", { status: 402 }),
      new Response("", { status: 402 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_PAYMENT_ERROR",
    });
  });

  it("classifies an unreadable paid result as a routing error", async () => {
    const { client } = createClient([
      new Response("", { status: 402 }),
      new Response("not-json", { status: 200 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ROUTING_ERROR",
    });
  });

  it("rejects a successful response routed to another Intent", async () => {
    const { client } = createClient([
      new Response("", { status: 402 }),
      new Response(JSON.stringify({ intent: "PACKAGE_LOOKUP" }), { status: 200 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ROUTING_ERROR",
    });
  });

  it("requires route metadata on a successful response", async () => {
    const { client } = createClient([
      new Response("", { status: 402 }),
      new Response(JSON.stringify({ cve_id: "CVE-2021-23337" }), { status: 200 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ROUTING_ERROR",
    });
  });
});
