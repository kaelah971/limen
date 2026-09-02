import { z } from "zod";
import {
  TelegraphChallengeError,
  TelegraphResponseError,
  TelegraphRoutingError,
} from "../../core/src/errors/errors";
import { assertExpectedNetwork, networksMatch, normalizeNetwork } from "./network";

const PaymentRequirementsSchema = z
  .object({
    scheme: z.string().min(1),
    network: z.string().min(1),
    asset: z.string().min(1),
    amount: z.string().regex(/^\d+$/),
    payTo: z.string().min(1),
    maxTimeoutSeconds: z.number().int().positive(),
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
