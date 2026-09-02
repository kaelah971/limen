import { privateKeyToAccount } from "viem/accounts";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  x402Client,
  x402HTTPClient,
} from "@x402/core/client";
import type { Network, PaymentRequired } from "@x402/core/types";
import {
  TelegraphChallengeError,
  TelegraphEngineError,
  TelegraphNormalizationError,
  TelegraphPaymentError,
  TelegraphResponseError,
  isLimenError,
  redactString,
} from "../../core/src/index";
import { assertExpectedNetwork, networksMatch, normalizeNetwork } from "./network";
import {
  assertSuccessfulEngineResponse,
  validatePaymentChallenge,
  verifyEngineIntent,
} from "./schemas";
import { normalizeTelegraphEvidence } from "./normalize";
import type {
  CveLookupInput,
  PreparedPayment,
  TelegraphClient,
  TelegraphConfig,
  TelegraphPaymentAdapter,
  PaymentPreparationInput,
} from "./types";

export interface TelegraphEngineClientOptions {
  config: TelegraphConfig;
  fetch?: typeof fetch;
  paymentAdapter?: TelegraphPaymentAdapter;
  now?: () => Date;
}

function isCveId(value: string): boolean {
  return /^CVE-\d{4}-\d{4,}$/i.test(value.trim());
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new TelegraphEngineError("The Telegraph Engine request failed.", {
      cause: error instanceof Error ? redactString(error.message) : "unknown",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestBody(input: CveLookupInput): Record<string, unknown> {
  const cveId = input.cveId.trim().toUpperCase();
  return {
    query: `Look up current vulnerability information for ${cveId}`,
    context: { cve_id: cveId },
  };
}

export class TelegraphEngineClient implements TelegraphClient {
  private readonly fetchImpl: typeof fetch;
  private readonly paymentAdapter: TelegraphPaymentAdapter;
  private readonly now: () => Date;
  private readonly config: TelegraphConfig;

  constructor(options: TelegraphEngineClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetch ?? fetch;
    this.paymentAdapter =
      options.paymentAdapter ?? createOfficialX402PaymentAdapter(options.config);
    this.now = options.now ?? (() => new Date());
  }

  async lookupCve(input: CveLookupInput) {
    if (!isCveId(input.cveId)) {
      throw new TelegraphResponseError("A valid CVE identifier is required.");
    }

    const requestedAt = this.now().toISOString();
    const request = buildRequestBody(input);
    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    };

    const challengeResponse = await fetchWithTimeout(
      this.fetchImpl,
      this.config.engineUrl,
      requestInit,
      this.config.timeoutMs,
    );

    if (challengeResponse.status !== 402) {
      const body = await readResponseBody(challengeResponse);
      if (challengeResponse.status >= 200 && challengeResponse.status < 300) {
        throw new TelegraphChallengeError(
          "Telegraph returned evidence without an x402 payment challenge.",
          { status: challengeResponse.status, bodyType: body === null ? "null" : typeof body },
        );
      }
      throw new TelegraphEngineError("Telegraph rejected the Engine request.", {
        status: challengeResponse.status,
        bodyType: body === null ? "null" : typeof body,
      });
    }

    const challengeBody = await readResponseBody(challengeResponse);
    let payment: PreparedPayment;
    try {
      payment = await this.paymentAdapter.preparePayment({
        response: challengeResponse,
        body: challengeBody,
        expectedNetwork: this.config.expectedNetwork,
      });
    } catch (error) {
      if (isLimenError(error)) {
        throw error;
      }
      throw new TelegraphPaymentError("Telegraph payment preparation failed.");
    }

    assertExpectedNetwork(payment.network, this.config.expectedNetwork);
    if (payment.scheme !== "exact") {
      throw new TelegraphChallengeError(
        "Telegraph payment did not use the required exact scheme.",
        { scheme: payment.scheme },
      );
    }

    let paidResponse: Response;
    try {
      paidResponse = await fetchWithTimeout(
        this.fetchImpl,
        this.config.engineUrl,
        {
          ...requestInit,
          headers: {
            ...requestInit.headers,
            ...payment.headers,
          },
        },
        this.config.timeoutMs,
      );
    } catch (error) {
      if (isLimenError(error)) {
        throw error;
      }
      throw new TelegraphEngineError("The paid Telegraph Engine request failed.");
    }

    const responseBody = await readResponseBody(paidResponse);
    if (paidResponse.status === 402) {
      throw new TelegraphPaymentError(
        "Telegraph did not accept the payment challenge response.",
        { status: paidResponse.status },
      );
    }
    if (paidResponse.status >= 500) {
      throw new TelegraphEngineError("Telegraph returned a server error after payment.", {
        status: paidResponse.status,
      });
    }
    assertSuccessfulEngineResponse(paidResponse.status, responseBody);
    verifyEngineIntent(responseBody);

    try {
      return normalizeTelegraphEvidence(responseBody, {
        requestedAt,
        receivedAt: this.now().toISOString(),
        payment: {
          network: normalizeNetwork(payment.network),
          scheme: payment.scheme,
          costUsd: payment.costUsd,
        },
      });
    } catch (error) {
      if (error instanceof TelegraphNormalizationError) {
        throw error;
      }
      throw new TelegraphNormalizationError(
        "Telegraph evidence could not be normalized.",
      );
    }
  }
}

export function createTelegraphClient(
  config: TelegraphConfig,
  options: Omit<TelegraphEngineClientOptions, "config"> = {},
): TelegraphClient {
  return new TelegraphEngineClient({ ...options, config });
}

export function createOfficialX402PaymentAdapter(
  config: Pick<TelegraphConfig, "privateKey" | "expectedNetwork">,
): TelegraphPaymentAdapter {
  const account = privateKeyToAccount(config.privateKey as `0x${string}`);
  const expectedNetwork = normalizeNetwork(config.expectedNetwork) as Network;
  const paymentClient = new x402Client((_version, requirements) => {
    const matchingRequirement = requirements.find(
      (requirement) =>
        requirement.scheme === "exact" &&
        networksMatch(requirement.network, expectedNetwork),
    );
    if (!matchingRequirement) {
      throw new Error("No exact payment requirement matched the expected network.");
    }
    return matchingRequirement;
  });

  registerExactEvmScheme(paymentClient, {
    signer: account,
    networks: [expectedNetwork],
  });
  const httpClient = new x402HTTPClient(paymentClient);

  return {
    async preparePayment(input: PaymentPreparationInput): Promise<PreparedPayment> {
      let challenge: PaymentRequired;
      try {
        challenge = httpClient.getPaymentRequiredResponse(
          (name) => input.response.headers.get(name),
          input.body,
        );
      } catch {
        throw new TelegraphChallengeError(
          "Telegraph returned an unreadable x402 payment challenge.",
        );
      }

      const selected = validatePaymentChallenge(
        challenge,
        input.expectedNetwork,
      );

      let payload;
      try {
        payload = await httpClient.createPaymentPayload(challenge);
      } catch {
        throw new TelegraphPaymentError(
          "The official x402 client could not construct payment proof.",
          {
            network: selected.network,
            scheme: selected.scheme,
          },
        );
      }

      const encoded = httpClient.encodePaymentSignatureHeader(payload);
      const paymentSignature =
        encoded["PAYMENT-SIGNATURE"] ?? encoded["payment-signature"];
      if (!paymentSignature) {
        throw new TelegraphPaymentError(
          "The x402 client did not return a payment signature header.",
        );
      }

      return {
        headers: { "PAYMENT-SIGNATURE": paymentSignature },
        network: selected.network,
        scheme: selected.scheme,
        amount: selected.amount,
        asset: selected.asset,
        costUsd: null,
      };
    },
  };
}
