import {
  PersistedRunDetailSchema,
  PersistedRunSchema,
} from "./schemas";
import { validateLedgerRunIngest } from "./validation";
import type {
  EvidenceLedger,
  LedgerRunIngest,
  PersistedRun,
  PersistedRunDetail,
} from "./types";

export class LedgerClientError extends Error {
  readonly code = "LEDGER_CLIENT_ERROR" as const;
  readonly status?: number;
  readonly responseCode?: string;
  readonly reason?: "timeout" | "network";

  constructor(
    message: string,
    options: {
      status?: number;
      responseCode?: string;
      reason?: "timeout" | "network";
    } = {},
  ) {
    super(message);
    this.name = "LedgerClientError";
    this.status = options.status;
    this.responseCode = options.responseCode;
    this.reason = options.reason;
  }
}

export interface LedgerHttpClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function responseCode(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const code = (body as Record<string, unknown>).code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(code)
    ? code
    : undefined;
}

function endpointUrl(baseUrl: string, suffix: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new LedgerClientError("The evidence ledger URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LedgerClientError("The evidence ledger URL must use HTTP or HTTPS.");
  }
  return `${parsed.toString().replace(/\/$/, "")}${suffix}`;
}

export class LedgerIngestClient implements Pick<EvidenceLedger, "persistRun" | "getRun"> {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: LedgerHttpClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async persistRun(input: LedgerRunIngest): Promise<PersistedRun> {
    const payload = validateLedgerRunIngest(input);
    const response = await this.request("/v1/ledger/runs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const parsed = PersistedRunSchema.safeParse(response);
    if (!parsed.success) {
      throw new LedgerClientError("The evidence ledger returned an invalid run result.");
    }
    return parsed.data;
  }

  async getRun(id: string): Promise<PersistedRunDetail | null> {
    const response = await this.request(
      `/v1/ledger/runs/${encodeURIComponent(id)}`,
      { method: "GET" },
      { allowNotFound: true },
    );
    if (response === null) {
      return null;
    }
    const parsed = PersistedRunDetailSchema.safeParse(response);
    if (!parsed.success) {
      throw new LedgerClientError("The evidence ledger returned an invalid run record.");
    }
    return parsed.data;
  }

  private async request(
    path: string,
    init: RequestInit,
    options: { allowNotFound?: boolean } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(endpointUrl(this.options.url, path), {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${this.options.token}`,
          ...init.headers,
        },
      });
      const body = await readJson(response);
      if (!response.ok) {
        if (options.allowNotFound && response.status === 404) {
          return null;
        }
        throw new LedgerClientError(
          response.status === 401
            ? "The evidence ledger rejected the ingest token."
            : "The evidence ledger request failed.",
          { status: response.status, responseCode: responseCode(body) },
        );
      }
      return body;
    } catch (error) {
      if (error instanceof LedgerClientError) {
        throw error;
      }
      throw new LedgerClientError(
        error instanceof Error && error.name === "AbortError"
          ? "The evidence ledger request timed out."
          : "The evidence ledger could not be reached.",
        {
          reason: error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "network",
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
