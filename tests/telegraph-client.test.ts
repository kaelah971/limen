import { describe, expect, it, vi } from "vitest";
import {
  BASE_SEPOLIA_USDC_ASSET,
  createOfficialX402PaymentAdapter,
  TelegraphEngineClient,
} from "../packages/telegraph/src";
import type {
  TelegraphConfig,
  TelegraphPaymentAdapter,
} from "../packages/telegraph/src";

const config: TelegraphConfig = {
  engineUrl: "http://13.237.89.59:7044/engine/v1/ask",
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
       asset: "0x036CbD53842c5426634e7929541eC2318f3DCf7e",
       payTo: "0x0000000000000000000000000000000000000002",
       maxTimeoutSeconds: 60,
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

function officialChallenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    x402Version: 2,
    resource: {
      url: config.engineUrl,
      description: "Test CVE lookup",
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",
      asset: BASE_SEPOLIA_USDC_ASSET,
      amount: "10000",
      payTo: "0x0000000000000000000000000000000000000002",
      maxTimeoutSeconds: 60,
      extra: {},
      ...overrides,
    }],
  };
}

function officialChallengeEnvelope(
  requirementOverrides: Record<string, unknown> = {},
  envelopeOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...officialChallenge(requirementOverrides),
    ...envelopeOverrides,
  };
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

  it.each([
    ["malformed recipient", { payTo: "not-an-address" }],
    ["unexpected asset", { asset: "0x0000000000000000000000000000000000000001" }],
    ["absurd amount", { amount: "999999999999999999999999" }],
    ["excessive timeout", { maxTimeoutSeconds: 121 }],
  ])("does not issue a paid request for an invalid official challenge: %s", async (_label, overrides) => {
    const { calls } = createClient([
      new Response(JSON.stringify(officialChallenge(overrides)), { status: 402 }),
    ], createOfficialX402PaymentAdapter({
      privateKey: `0x${"1".repeat(64)}`,
      expectedNetwork: "eip155:84532",
    }));

    const client = new TelegraphEngineClient({
      config,
      fetch: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify(officialChallenge(overrides)), { status: 402 });
      },
      paymentAdapter: createOfficialX402PaymentAdapter({
        privateKey: `0x${"1".repeat(64)}`,
        expectedNetwork: "eip155:84532",
      }),
    });

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_CHALLENGE_ERROR",
    });
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0]?.init?.headers).get("PAYMENT-SIGNATURE")).toBeNull();
  });

  it.each([
    ["wrong x402 version", officialChallengeEnvelope({}, { x402Version: 1 }), "TELEGRAPH_CHALLENGE_ERROR"],
    ["wrong network", officialChallengeEnvelope({ network: "eip155:1" }), "TELEGRAPH_CHALLENGE_ERROR"],
    ["unsupported scheme", officialChallengeEnvelope({ scheme: "upto" }), "TELEGRAPH_CHALLENGE_ERROR"],
  ])("does not issue a paid request for %s", async (_label, challenge, code) => {
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const adapter = createOfficialX402PaymentAdapter({
      privateKey: `0x${"1".repeat(64)}`,
      expectedNetwork: "eip155:84532",
    });
    const client = new TelegraphEngineClient({
      config,
      fetch: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify(challenge), { status: 402 });
      },
      paymentAdapter: adapter,
    });

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({ code });
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0]?.init?.headers).get("PAYMENT-SIGNATURE")).toBeNull();
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

  it("rejects Engine redirects without issuing a second request", async () => {
    const { client, calls } = createClient([
      new Response("", {
        status: 302,
        headers: { location: "https://attacker.example/collect" },
      }),
    ]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("error");
  });

  it("rejects an oversized challenge before reading provider-controlled content", async () => {
    const text = vi.fn(async () => "never-read");
    const response = {
      status: 402,
      headers: new Headers({ "content-length": String(2 * 1024 * 1024 + 1) }),
      text,
    } as unknown as Response;
    const { client } = createClient([response]);

    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_ENGINE_ERROR",
      details: { reason: "response_too_large" },
    });
    expect(text).not.toHaveBeenCalled();
  });

  it("enforces the run-local payment ceiling before a paid request", async () => {
    const responseBody = JSON.stringify({
      intent: "CVE_LOOKUP",
      cve_id: "CVE-2021-23337",
    });
    const responses = Array.from({ length: 11 }, (_, index) =>
      index % 2 === 0
        ? new Response("", { status: 402 })
        : new Response(responseBody, { status: 200 }),
    );
    const { client, calls } = createClient(
      responses,
      createPaymentAdapter({ amount: "50000" }),
    );

    for (let index = 0; index < 5; index += 1) {
      await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).resolves.toMatchObject({
        cveId: "CVE-2021-23337",
      });
    }
    await expect(client.lookupCve({ cveId: "CVE-2021-23337" })).rejects.toMatchObject({
      code: "TELEGRAPH_CHALLENGE_ERROR",
    });
    expect(calls).toHaveLength(11);
    expect(new Headers(calls[10]?.init?.headers).get("PAYMENT-SIGNATURE")).toBeNull();
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
