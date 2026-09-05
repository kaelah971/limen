import { z } from "zod";
import {
  TelegraphChallengeError,
  TelegraphResponseError,
  TelegraphRoutingError,
} from "../../core/src/errors/errors";
import { assertExpectedNetwork, networksMatch, normalizeNetwork } from "./network";

export const BASE_SEPOLIA_USDC_ASSET =
  "0x036CbD53842c5426634e7929541eC2318f3DCf7e";
export const MAX_PAYMENT_AMOUNT_BASE_UNITS = BigInt(50_000);
export const MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS = BigInt(250_000);
export const MAX_PAYMENT_TIMEOUT_SECONDS = 120;

const PaymentRequirementsSchema = z
  .object({
    scheme: z.string().min(1),
    network: z.string().min(1),
    asset: z.string().min(1),
    amount: z.string().regex(/^\d+$/),
    payTo: z.string().min(1),
    maxTimeoutSeconds: z.number().int().positive().max(MAX_PAYMENT_TIMEOUT_SECONDS),
    extra: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const PaymentRequiredSchema = z
  .object({
    x402Version: z.number().int(),
    accepts: z.array(PaymentRequirementsSchema).min(1),
  })
  .passthrough();

export type ValidatedPaymentChallenge = z.infer<
  typeof PaymentRequirementsSchema
> & {
  x402Version: 2;
};

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function parsePaymentAmount(value: string): bigint {
  if (typeof value !== "string" || value.length === 0 || value.length > 24 || !/^\d+$/.test(value)) {
    throw new TelegraphChallengeError(
      "Telegraph returned an invalid payment amount.",
    );
  }

  try {
    const amount = BigInt(value);
    if (amount <= BigInt(0) || amount > MAX_PAYMENT_AMOUNT_BASE_UNITS) {
      throw new TelegraphChallengeError(
        "Telegraph requested an amount outside the Judge Mode payment ceiling.",
        { maxAmountBaseUnits: MAX_PAYMENT_AMOUNT_BASE_UNITS.toString() },
      );
    }
    return amount;
  } catch (error) {
    if (error instanceof TelegraphChallengeError) {
      throw error;
    }
    throw new TelegraphChallengeError("Telegraph returned an invalid payment amount.");
  }
}

function assertAuthorizedAmount(authorizedAmountBaseUnits: bigint): void {
  if (
    typeof authorizedAmountBaseUnits !== "bigint" ||
    authorizedAmountBaseUnits < BigInt(0) ||
    authorizedAmountBaseUnits > MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS
  ) {
    throw new TelegraphChallengeError(
      "Telegraph payment authorization state is invalid.",
    );
  }
}

export function assertPaymentRequirement(
  requirement: Pick<ValidatedPaymentChallenge, "scheme" | "network" | "asset" | "amount" | "payTo" | "maxTimeoutSeconds">,
  expectedNetwork: string,
  authorizedAmountBaseUnits = BigInt(0),
): bigint {
  assertAuthorizedAmount(authorizedAmountBaseUnits);
  if (requirement.scheme !== "exact") {
    throw new TelegraphChallengeError(
      "Telegraph did not offer the required exact payment scheme.",
      { scheme: requirement.scheme },
    );
  }
  assertExpectedNetwork(requirement.network, expectedNetwork);
  if (requirement.asset.toLowerCase() !== BASE_SEPOLIA_USDC_ASSET.toLowerCase()) {
    throw new TelegraphChallengeError(
      "Telegraph requested an unsupported payment asset.",
      { asset: requirement.asset },
    );
  }
  if (!isEvmAddress(requirement.payTo)) {
    throw new TelegraphChallengeError(
      "Telegraph returned an invalid payment recipient.",
    );
  }
  if (!Number.isSafeInteger(requirement.maxTimeoutSeconds) ||
      requirement.maxTimeoutSeconds <= 0 ||
      requirement.maxTimeoutSeconds > MAX_PAYMENT_TIMEOUT_SECONDS) {
    throw new TelegraphChallengeError(
      "Telegraph returned an invalid payment timeout.",
    );
  }

  const amount = parsePaymentAmount(requirement.amount);
  if (authorizedAmountBaseUnits + amount > MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS) {
    throw new TelegraphChallengeError(
      "Telegraph payment would exceed the per-run Judge Mode spending ceiling.",
      { maxRunAmountBaseUnits: MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS.toString() },
    );
  }
  return amount;
}

export function reservePaymentAmount(
  state: { authorizedAmountBaseUnits: bigint },
  amount: bigint,
): void {
  assertAuthorizedAmount(state.authorizedAmountBaseUnits);
  if (state.authorizedAmountBaseUnits + amount > MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS) {
    throw new TelegraphChallengeError(
      "Telegraph payment would exceed the per-run Judge Mode spending ceiling.",
      { maxRunAmountBaseUnits: MAX_RUN_PAYMENT_AMOUNT_BASE_UNITS.toString() },
    );
  }
  state.authorizedAmountBaseUnits += amount;
}

export function verifyEngineIntent(response: unknown): void {
  if (response === null || typeof response !== "object" || Array.isArray(response)) {
    throw new TelegraphRoutingError(
      "Telegraph returned no routable response metadata.",
      { responseType: Array.isArray(response) ? "array" : typeof response },
    );
  }

  const intent = (response as Record<string, unknown>).intent;
  if (intent !== "CVE_LOOKUP") {
    throw new TelegraphRoutingError(
      "Telegraph routed the request to an unexpected Intent.",
      { intent: typeof intent === "string" ? intent : null },
    );
  }
}

export function validatePaymentChallenge(
  challenge: unknown,
  expectedNetwork: string,
): ValidatedPaymentChallenge {
  const parsed = PaymentRequiredSchema.safeParse(challenge);
  if (!parsed.success) {
    throw new TelegraphChallengeError(
      "Telegraph returned an invalid x402 payment challenge.",
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    );
  }

  if (parsed.data.x402Version !== 2) {
    throw new TelegraphChallengeError(
      "Telegraph returned an unsupported x402 version.",
      { x402Version: parsed.data.x402Version },
    );
  }

  const normalizedExpectedNetwork = normalizeNetwork(expectedNetwork);
  const expectedRequirements = parsed.data.accepts.filter((requirement) =>
    networksMatch(requirement.network, normalizedExpectedNetwork),
  );

  if (expectedRequirements.length === 0) {
    const actualNetworks = parsed.data.accepts.map((requirement) =>
      normalizeNetwork(requirement.network),
    );
    assertExpectedNetwork(actualNetworks[0] ?? "unknown:unknown", expectedNetwork);
  }

  const exactRequirement = expectedRequirements.find(
    (requirement) => requirement.scheme === "exact",
  );
  if (!exactRequirement) {
    throw new TelegraphChallengeError(
      "Telegraph did not offer the required exact payment scheme on the expected network.",
      {
        expectedNetwork: normalizedExpectedNetwork,
        offeredSchemes: expectedRequirements.map((requirement) => requirement.scheme),
      },
    );
  }

  assertPaymentRequirement(exactRequirement, normalizedExpectedNetwork);

  return {
    ...exactRequirement,
    x402Version: 2,
  };
}

export function assertSuccessfulEngineResponse(
  status: number,
  body: unknown,
): void {
  if (status < 200 || status >= 300) {
    throw new TelegraphResponseError(
      "Telegraph returned an unsuccessful paid Engine response.",
      { status, bodyType: body === null ? "null" : typeof body },
    );
  }
}
