import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  serializeError,
  UnexpectedNetworkError,
} from "../packages/core/src";
import {
  BASE_SEPOLIA_NETWORK,
  assertExpectedNetwork,
  isBaseSepoliaConfig,
  loadTelegraphConfig,
  MAX_PAYMENT_AMOUNT_BASE_UNITS,
  MAX_PAYMENT_TIMEOUT_SECONDS,
  BASE_SEPOLIA_USDC_ASSET,
  validatePaymentChallenge,
} from "../packages/telegraph/src";

const validEnvironment = {
  TELEGRAPH_ENGINE_URL: "http://13.237.89.59:7044/engine/v1/ask",
  TELEGRAPH_PRIVATE_KEY: `0x${"0".repeat(64)}`,
  TELEGRAPH_EXPECTED_NETWORK: "base-sepolia",
  TELEGRAPH_TIMEOUT_MS: "5000",
};
const currentEngineUrl = "http://13.237.89.59:7044/engine/v1/ask";
const syntheticPrivateKey = `0x${"a".repeat(64)}`;

const validRequirement = {
  scheme: "exact",
  network: BASE_SEPOLIA_NETWORK,
  asset: BASE_SEPOLIA_USDC_ASSET,
  amount: "10000",
  payTo: "0x0000000000000000000000000000000000000002",
  maxTimeoutSeconds: 60,
  extra: {},
};

describe("loadTelegraphConfig", () => {
  it("loads a valid Base Sepolia configuration", () => {
    const config = loadTelegraphConfig(validEnvironment);

    expect(config).toMatchObject({
      engineUrl: validEnvironment.TELEGRAPH_ENGINE_URL,
      expectedNetwork: BASE_SEPOLIA_NETWORK,
      timeoutMs: 5000,
    });
    expect(isBaseSepoliaConfig(config)).toBe(true);
  });

  it("accepts the current R0 Engine URL and a 66-character private key", () => {
    const config = loadTelegraphConfig({
      TELEGRAPH_ENGINE_URL: currentEngineUrl,
      TELEGRAPH_PRIVATE_KEY: syntheticPrivateKey,
    });

    expect(config).toMatchObject({
      engineUrl: currentEngineUrl,
      expectedNetwork: BASE_SEPOLIA_NETWORK,
      timeoutMs: 30000,
    });
  });

  it("trims values and defaults blank optional network and timeout settings", () => {
    const config = loadTelegraphConfig({
      TELEGRAPH_ENGINE_URL: `\n${currentEngineUrl} \t`,
      TELEGRAPH_PRIVATE_KEY: `\n${syntheticPrivateKey}\r\n`,
      TELEGRAPH_EXPECTED_NETWORK: " \n",
      TELEGRAPH_TIMEOUT_MS: "\t",
    });

    expect(config).toMatchObject({
      engineUrl: currentEngineUrl,
      expectedNetwork: BASE_SEPOLIA_NETWORK,
      timeoutMs: 30000,
    });
  });

  it("rejects missing required configuration", () => {
    expect(() => loadTelegraphConfig({})).toThrowError(ConfigurationError);
  });

  it("rejects malformed Engine URLs", () => {
    expect(() =>
      loadTelegraphConfig({
        ...validEnvironment,
        TELEGRAPH_ENGINE_URL: "not-a-url",
      }),
    ).toThrowError(ConfigurationError);
  });

  it.each([
    "https://engine.example.test/v1/ask",
    "http://127.0.0.1:7044/engine/v1/ask",
    "http://169.254.169.254/engine/v1/ask",
    "https://attacker.example/engine/v1/ask",
  ])("rejects an unapproved Engine origin: %s", (engineUrl) => {
    expect(() => loadTelegraphConfig({
      ...validEnvironment,
      TELEGRAPH_ENGINE_URL: engineUrl,
    })).toThrowError(ConfigurationError);
  });

  it("rejects an invalid expected network format", () => {
    expect(() =>
      loadTelegraphConfig({
        ...validEnvironment,
        TELEGRAPH_EXPECTED_NETWORK: "mainnet",
      }),
    ).toThrowError(ConfigurationError);
  });

  it("reports only safe metadata for a malformed private key", () => {
    const malformedKey = syntheticPrivateKey.slice(0, -1);
    let error: unknown;
    try {
      loadTelegraphConfig({
        TELEGRAPH_ENGINE_URL: currentEngineUrl,
        TELEGRAPH_PRIVATE_KEY: malformedKey,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    const serialized = JSON.stringify(serializeError(error));
    expect(serialized).not.toContain(syntheticPrivateKey);
    expect(serialized).toContain("TELEGRAPH_PRIVATE_KEY");
    expect(serialized).toContain('"trimmedLength":65');
    expect(serialized).toContain('"matchesRequiredPattern":false');
    expect(serialized).toContain('"validUrl":true');
    expect(serialized).toContain('"normalizedValue":"eip155:84532"');
  });
});

describe("payment challenge validation", () => {
  it("accepts the expected network and exact scheme without using a catalog price", () => {
    const challenge = validatePaymentChallenge(
      {
        x402Version: 2,
        resource: { url: validEnvironment.TELEGRAPH_ENGINE_URL },
        accepts: [validRequirement],
      },
      BASE_SEPOLIA_NETWORK,
    );

    expect(challenge.amount).toBe("10000");
    expect(challenge.payTo).toBe(validRequirement.payTo);
  });

  it("fails safely when a mainnet challenge is returned for Base Sepolia", () => {
    expect(() =>
      validatePaymentChallenge(
        {
          x402Version: 2,
          accepts: [
            {
              ...validRequirement,
              network: "eip155:1",
            },
          ],
        },
        BASE_SEPOLIA_NETWORK,
      ),
    ).toThrowError(UnexpectedNetworkError);
  });

  it("rejects a non-exact scheme on the expected network", () => {
    expect(() =>
      validatePaymentChallenge(
        {
          x402Version: 2,
          accepts: [{ ...validRequirement, scheme: "upto" }],
        },
        BASE_SEPOLIA_NETWORK,
      ),
    ).toThrow("required exact payment scheme");
  });

  it.each([
    ["malformed recipient", { payTo: "not-an-address" }],
    ["zero recipient", { payTo: "0x0000000000000000000000000000000000000000" }],
    ["unexpected asset", { asset: "0x0000000000000000000000000000000000000001" }],
    ["amount above ceiling", { amount: "50001" }],
    ["huge amount", { amount: "9".repeat(25) }],
    ["zero amount", { amount: "0" }],
    ["excessive timeout", { maxTimeoutSeconds: MAX_PAYMENT_TIMEOUT_SECONDS + 1 }],
    ["malformed timeout", { maxTimeoutSeconds: "60" }],
  ] as const)("rejects %s before payment construction", (_label, overrides) => {
    expect(() => validatePaymentChallenge(
      {
        x402Version: 2,
        accepts: [{ ...validRequirement, ...overrides }],
      },
      BASE_SEPOLIA_NETWORK,
    )).toThrow();
  });

  it("accepts the exact per-request ceiling and rejects the synthetic test asset", () => {
    expect(validatePaymentChallenge(
      {
        x402Version: 2,
        accepts: [{ ...validRequirement, amount: MAX_PAYMENT_AMOUNT_BASE_UNITS.toString() }],
      },
      BASE_SEPOLIA_NETWORK,
    ).amount).toBe("50000");
  });

  it("rejects an unsupported x402 version", () => {
    expect(() =>
      validatePaymentChallenge(
        { x402Version: 1, accepts: [validRequirement] },
        BASE_SEPOLIA_NETWORK,
      ),
    ).toThrow("unsupported x402 version");
  });

  it("rejects a direct network mismatch", () => {
    expect(() =>
      assertExpectedNetwork("eip155:1", BASE_SEPOLIA_NETWORK),
    ).toThrowError(UnexpectedNetworkError);
  });
});
