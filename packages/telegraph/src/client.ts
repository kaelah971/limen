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
  ConfigurationError,
  isLimenError,
  redactString,
} from "../../core/src/index";
import { assertExpectedNetwork, networksMatch, normalizeNetwork } from "./network";
import { assertTelegraphEngineUrl } from "./config";
import {
  assertSuccessfulEngineResponse,
  assertPaymentRequirement,
  parsePaymentAmount,
  reservePaymentAmount,
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
  PaymentAuthorizationState,
} from "./types";

const TELEGRAPH_CHALLENGE_MAX_ATTEMPTS = 2;
const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

function assertResponseBodySize(response: Response): void {
  const contentLength = response.headers?.get("content-length");
  if (contentLength === null || contentLength === undefined) {
    return;
  }

  const parsedLength = Number(contentLength);
  if (!Number.isFinite(parsedLength) || parsedLength > MAX_RESPONSE_BODY_BYTES) {
    throw new TelegraphEngineError("The Telegraph Engine response body is too large.", {
      reason: "response_too_large",
    });
  }
}

export interface TelegraphEngineClientOptions {
  config: TelegraphConfig;
  fetch?: typeof fetch;
  paymentAdapter?: TelegraphPaymentAdapter;
  paymentAuthorizationState?: PaymentAuthorizationState;
  now?: () => Date;
}

function isCveId(value: string): boolean {
  return /^CVE-\d{4}-\d{4,}$/i.test(value.trim());
}

async function readResponseBody(
  response: Response,
  timeoutMs: number,
  signal?: AbortSignal,
  onTimeout?: () => void,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    assertResponseBodySize(response);
    const text = await Promise.race([
      response.text(),
      new Promise<string>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new TelegraphEngineError(
            "The Telegraph Engine response body timed out.",
            { reason: "timeout" },
          ));
        }, timeoutMs);
      }),
    ]);
    if (text.trim() === "") {
      return undefined;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BODY_BYTES) {
      throw new TelegraphEngineError("The Telegraph Engine response body is too large.", {
        reason: "response_too_large",
      });
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  } catch (error) {
    if (error instanceof TelegraphEngineError) {
      throw error;
    }
    throw new TelegraphEngineError(
      "The Telegraph Engine response body could not be read.",
      {
        reason: signal?.aborted ? "timeout" : "network_error",
        ...(signal?.aborted
          ? {}
          : { cause: error instanceof Error ? redactString(error.message) : "unknown" }),
      },
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      throw new TelegraphEngineError(
        "The Telegraph Engine request timed out.",
        { reason: "timeout" },
      );
    }
    const body = await readResponseBody(
      response,
      timeoutMs,
      controller.signal,
      () => controller.abort(),
    );
    return { response, body };
  } catch (error) {
    if (error instanceof TelegraphEngineError) {
      throw error;
    }
    throw new TelegraphEngineError("The Telegraph Engine request failed.", {
      reason: error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "network_error",
      ...(error instanceof Error && error.name === "AbortError"
        ? {}
        : { cause: error instanceof Error ? redactString(error.message) : "unknown" }),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof TelegraphEngineError && error.details?.reason === "timeout";
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
  private readonly paymentAuthorizationState: PaymentAuthorizationState;

  constructor(options: TelegraphEngineClientOptions) {
    try {
      assertTelegraphEngineUrl(options.config.engineUrl);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError("Telegraph Engine configuration is invalid.");
    }
    this.config = options.config;
    this.fetchImpl = options.fetch ?? fetch;
    this.paymentAuthorizationState = options.paymentAuthorizationState ?? {
      authorizedAmountBaseUnits: BigInt(0),
    };
    this.paymentAdapter =
      options.paymentAdapter ?? createOfficialX402PaymentAdapter(
        options.config,
        this.paymentAuthorizationState,
      );
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

    let challengeResponse: Response | undefined;
    let challengeBody: unknown;
    for (let attempt = 0; attempt < TELEGRAPH_CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const challenge = await fetchWithTimeout(
          this.fetchImpl,
          this.config.engineUrl,
          requestInit,
          this.config.timeoutMs,
        );
        challengeResponse = challenge.response;
        challengeBody = challenge.body;
        break;
      } catch (error) {
        if (!isTimeoutError(error) || attempt === TELEGRAPH_CHALLENGE_MAX_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    if (challengeResponse === undefined) {
      throw new TelegraphEngineError("Telegraph did not return a payment challenge.");
    }

    if (challengeResponse.status !== 402) {
      const body = challengeBody;
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
    const preparedAmount = parsePaymentAmount(payment.amount);
    if (payment.spendReserved &&
        this.paymentAuthorizationState.authorizedAmountBaseUnits < preparedAmount) {
      throw new TelegraphPaymentError("Telegraph payment authorization state is invalid.");
    }
    const amount = assertPaymentRequirement(
      payment,
      this.config.expectedNetwork,
      payment.spendReserved
        ? this.paymentAuthorizationState.authorizedAmountBaseUnits - preparedAmount
        : this.paymentAuthorizationState.authorizedAmountBaseUnits,
    );
    if (!payment.spendReserved) {
      reservePaymentAmount(this.paymentAuthorizationState, amount);
    }

    let paidResponse: Response;
    let responseBody: unknown;
    try {
      const paid = await fetchWithTimeout(
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
      paidResponse = paid.response;
      responseBody = paid.body;
    } catch (error) {
      if (isLimenError(error)) {
        throw error;
      }
      throw new TelegraphEngineError("The paid Telegraph Engine request failed.");
    }

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
      const evidence = normalizeTelegraphEvidence(responseBody, {
        requestedAt,
        receivedAt: this.now().toISOString(),
        payment: {
          network: normalizeNetwork(payment.network),
          scheme: payment.scheme,
          costUsd: payment.costUsd,
        },
      });
      const requestedCveId = input.cveId.trim().toUpperCase();
      if (evidence.cveId !== null && evidence.cveId !== requestedCveId) {
        throw new TelegraphResponseError(
          "Telegraph returned evidence for a different CVE.",
          { expectedCveId: requestedCveId, actualCveId: evidence.cveId },
        );
      }
      return evidence;
    } catch (error) {
      if (error instanceof TelegraphNormalizationError || error instanceof TelegraphResponseError) {
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
  paymentAuthorizationState: PaymentAuthorizationState = {
    authorizedAmountBaseUnits: BigInt(0),
  },
): TelegraphPaymentAdapter {
  const account = privateKeyToAccount(config.privateKey as `0x${string}`);
  const expectedNetwork = normalizeNetwork(config.expectedNetwork) as Network;
  let selectedRequirement: Awaited<ReturnType<typeof validatePaymentChallenge>> | undefined;
  const paymentClient = new x402Client((_version, requirements) => {
    const matchingRequirement = requirements.find(
      (requirement) =>
        selectedRequirement !== undefined &&
        requirement.scheme === selectedRequirement.scheme &&
        networksMatch(requirement.network, selectedRequirement.network) &&
        requirement.asset.toLowerCase() === selectedRequirement.asset.toLowerCase() &&
        requirement.amount === selectedRequirement.amount &&
        requirement.payTo.toLowerCase() === selectedRequirement.payTo.toLowerCase() &&
        requirement.maxTimeoutSeconds === selectedRequirement.maxTimeoutSeconds,
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
      const amount = assertPaymentRequirement(
        selected,
        input.expectedNetwork,
        paymentAuthorizationState.authorizedAmountBaseUnits,
      );
      selectedRequirement = selected;

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
      reservePaymentAmount(paymentAuthorizationState, amount);

      return {
        headers: { "PAYMENT-SIGNATURE": paymentSignature },
        network: selected.network,
        scheme: selected.scheme,
        amount: selected.amount,
        asset: selected.asset,
        payTo: selected.payTo,
        maxTimeoutSeconds: selected.maxTimeoutSeconds,
        spendReserved: true,
        costUsd: null,
      };
    },
  };
}
