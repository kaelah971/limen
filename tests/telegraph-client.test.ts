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
  configOverrides: Partial<TelegraphConfig> = {},
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
    config: { ...config, ...configOverrides },
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

function hangingResponse(status: number): Response {
  return {
    status,
    text: () => new Promise<string>(() => undefined),
  } as unknown as Response;
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
    const { client, calls } = createClient([
      new Response("", { status: 402 }),
      new Response("", { status: 402 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_PAYMENT_ERROR",
    });
    expect(calls).toHaveLength(2);
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

  it("rejects paid evidence for a different CVE at the client boundary", async () => {
    const { client } = createClient([
      new Response("", { status: 402 }),
      new Response(JSON.stringify({
        intent: "CVE_LOOKUP",
        cve_id: "CVE-2024-0001",
      }), { status: 200 }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_RESPONSE_ERROR",
      details: {
        expectedCveId: "CVE-2021-23337",
        actualCveId: "CVE-2024-0001",
      },
    });
  });

  it("bounds unpaid challenge timeout retries", async () => {
    const { client, calls } = createClient(
      [hangingResponse(402), hangingResponse(402)],
      createPaymentAdapter(),
      { timeoutMs: 10 },
    );

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
      details: { reason: "timeout" },
    });
    expect(calls).toHaveLength(2);
    expect((calls[1]?.init?.signal as AbortSignal).aborted).toBe(true);
  });

  it("does not retry a paid request after its response body times out", async () => {
    const { client, calls } = createClient(
      [new Response("", { status: 402 }), hangingResponse(200)],
      createPaymentAdapter(),
      { timeoutMs: 10 },
    );

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
      details: { reason: "timeout" },
    });
    expect(calls).toHaveLength(2);
    expect((calls[1]?.init?.signal as AbortSignal).aborted).toBe(true);
  });

  it("retries a timed-out unpaid challenge once and stops after a successful 402", async () => {
    const { client, calls } = createClient(
      [
        hangingResponse(402),
        new Response("", { status: 402 }),
        new Response(JSON.stringify({
          intent: "CVE_LOOKUP",
          cve_id: "CVE-2021-23337",
        }), { status: 200 }),
      ],
      createPaymentAdapter(),
      { timeoutMs: 10 },
    );

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).resolves.toMatchObject({
      cveId: "CVE-2021-23337",
    });
    expect(calls).toHaveLength(3);
    expect(new Headers(calls[0]?.init?.headers).get("PAYMENT-SIGNATURE")).toBeNull();
    expect(new Headers(calls[1]?.init?.headers).get("PAYMENT-SIGNATURE")).toBeNull();
    expect(new Headers(calls[2]?.init?.headers).get("PAYMENT-SIGNATURE")).toBe(
      "test-signature",
    );
    expect((calls[0]?.init?.signal as AbortSignal).aborted).toBe(true);
  });

  it("does not retry a paid request after transport failure", async () => {
    const { client, calls } = createClient([new Response("", { status: 402 })]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
      details: { reason: "network_error" },
    });
    expect(calls).toHaveLength(2);
    expect((calls[1]?.init?.signal as AbortSignal).aborted).toBe(false);
  });

  it("does not retry a non-timeout unpaid challenge transport failure", async () => {
    const { client, calls } = createClient([]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
      details: { reason: "network_error" },
    });
    expect(calls).toHaveLength(1);
  });
});
