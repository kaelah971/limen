import * as actionsCore from "@actions/core";

const CALLBACK_AUDIENCE = "limen-api";
const CALLBACK_TIMEOUT_MS = 10_000;
const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_RESPONSE_BODY_BYTES = 64 * 1024;
const SHA_PATTERN = /^[0-9a-fA-F]{40}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface LimenCallbackCore {
  getIDToken(audience?: string): Promise<string>;
}

export interface LimenCallbackDependencies {
  core?: LimenCallbackCore;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface LimenEvaluationCallbackInput {
  limenApiUrl?: string;
  repositoryId: string | number | undefined;
  githubRunId: string | number | undefined;
  githubRunAttempt: string | number | undefined;
  workflowRef: string | undefined;
  commitSha: string | undefined;
  decision: "PASS" | "HOLD" | "REVIEW";
  receiptId?: string | null;
  evaluatedAt: string | undefined;
}

export type LimenCallbackStatus = "disabled" | "reported" | "failed";

export interface LimenCallbackResult {
  status: LimenCallbackStatus;
  errorCode?:
    | "CALLBACK_URL_INVALID"
    | "CALLBACK_CONTEXT_INVALID"
    | "CALLBACK_REQUEST_TOO_LARGE"
    | "OIDC_TOKEN_RETRIEVAL_FAILED"
    | "OIDC_TOKEN_INVALID"
    | "CALLBACK_TIMEOUT"
    | "CALLBACK_NETWORK_ERROR"
    | "CALLBACK_RESPONSE_TOO_LARGE"
    | "CALLBACK_RESPONSE_REJECTED";
  httpStatus?: number;
}

const defaultCore: LimenCallbackCore = actionsCore;

function failed(
  errorCode: NonNullable<LimenCallbackResult["errorCode"]>,
  httpStatus?: number,
): LimenCallbackResult {
  return {
    status: "failed",
    errorCode,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

function safePositiveInteger(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeText(value: string | undefined, maxLength: number): string | undefined {
  if (
    value === undefined
    || value.length === 0
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return undefined;
  }
  return value;
}

function buildRequestBody(input: LimenEvaluationCallbackInput): Record<string, unknown> | undefined {
  const repositoryId = safePositiveInteger(input.repositoryId);
  const githubRunId = safePositiveInteger(input.githubRunId);
  const githubRunAttempt = safePositiveInteger(input.githubRunAttempt);
  const workflowRef = safeText(input.workflowRef, 700);
  const commitSha = safeText(input.commitSha, 40);
  const evaluatedAt = safeText(input.evaluatedAt, 64);
  const receiptId = input.receiptId === undefined || input.receiptId === null
    ? null
    : safeText(input.receiptId, 255);
  if (
    repositoryId === undefined
    || githubRunId === undefined
    || githubRunAttempt === undefined
    || workflowRef === undefined
    || commitSha === undefined
    || !SHA_PATTERN.test(commitSha)
    || (input.decision !== "PASS" && input.decision !== "HOLD" && input.decision !== "REVIEW")
    || evaluatedAt === undefined
    || !ISO_TIMESTAMP_PATTERN.test(evaluatedAt)
    || Number.isNaN(Date.parse(evaluatedAt))
    || (input.receiptId !== undefined && input.receiptId !== null && receiptId === undefined)
  ) {
    return undefined;
  }
  return {
    repositoryId,
    githubRunId,
    githubRunAttempt,
    workflowRef,
    commitSha,
    decision: input.decision,
    receiptId,
    evaluatedAt,
  };
}

async function readBoundedResponseBody(response: Response): Promise<void> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength > MAX_RESPONSE_BODY_BYTES) {
      throw new Error("response_too_large");
    }
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BODY_BYTES) {
    throw new Error("response_too_large");
  }
}

export async function reportLimenEvaluation(
  input: LimenEvaluationCallbackInput,
  dependencies: LimenCallbackDependencies = {},
): Promise<LimenCallbackResult> {
  if (input.limenApiUrl === undefined) {
    return { status: "disabled" };
  }
  if (!input.limenApiUrl.startsWith("https://") || /[\s\u0000-\u001f\u007f]/.test(input.limenApiUrl)) {
    return failed("CALLBACK_URL_INVALID");
  }

  const body = buildRequestBody(input);
  if (body === undefined) {
    return failed("CALLBACK_CONTEXT_INVALID");
  }
  const serializedBody = JSON.stringify(body);
  if (new TextEncoder().encode(serializedBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    return failed("CALLBACK_REQUEST_TOO_LARGE");
  }

  let token: string;
  try {
    token = await (dependencies.core ?? defaultCore).getIDToken(CALLBACK_AUDIENCE);
  } catch {
    return failed("OIDC_TOKEN_RETRIEVAL_FAILED");
  }
  if (
    typeof token !== "string"
    || token.length === 0
    || new TextEncoder().encode(token).byteLength > MAX_TOKEN_BYTES
  ) {
    return failed("OIDC_TOKEN_INVALID");
  }

  const controller = new AbortController();
  const timeoutMs = dependencies.timeoutMs ?? CALLBACK_TIMEOUT_MS;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    const request = (dependencies.fetch ?? fetch)(
      `${input.limenApiUrl.replace(/\/+$/, "")}/v1/github/evaluations`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: serializedBody,
        redirect: "error",
        signal: controller.signal,
      },
    ).then(async (response) => {
      if (response.status < 200 || response.status >= 300) {
        try {
          await Promise.race([readBoundedResponseBody(response), timeoutPromise]);
        } catch (error) {
          if (error instanceof Error && error.message === "response_too_large") {
            throw error;
          }
        }
        return failed("CALLBACK_RESPONSE_REJECTED", response.status);
      }
      return { status: "reported" as const };
    });
    return await Promise.race([request, timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.message === "response_too_large") {
      return failed("CALLBACK_RESPONSE_TOO_LARGE");
    }
    return failed(timedOut ? "CALLBACK_TIMEOUT" : "CALLBACK_NETWORK_ERROR");
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
