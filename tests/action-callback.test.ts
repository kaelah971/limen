import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  reportLimenIntegrationFault,
  reportLimenEvaluation,
  type LimenCallbackDependencies,
} from "../action/src/limen-callback";
import { applyActionOutcome, isDeterministicConfigurationError, type ActionOutcomeRuntime } from "../action/src/main";
import { parseLimenApiUrl, readActionInputs, readOptionalLimenApiUrl } from "../action/src/inputs";
import { ConfigurationError } from "../packages/core/src";
import type { LimenRunResult } from "../action/src/types";

const REPOSITORY_ID = 123456;
const RUN_ID = 33959096100;
const RUN_ATTEMPT = 2;
const WORKFLOW_REF =
  "kaelah971/limen-demo/.github/workflows/limen.yml@refs/heads/main";
const CANONICAL_SHA = "a".repeat(40);
const EVALUATED_AT = "2026-09-06T12:00:00.000Z";
const OIDC_TOKEN = "raw-oidc-token-fixture";
const VALID_PRIVATE_KEY = `0x${"a".repeat(64)}`;

const healthCallbackInput = {
  limenApiUrl: "https://api.example.test",
  repositoryId: String(REPOSITORY_ID),
  githubRunId: String(RUN_ID),
  githubRunAttempt: String(RUN_ATTEMPT),
  workflowRef: WORKFLOW_REF,
  code: "CONFIGURATION_INVALID" as const,
  observedAt: EVALUATED_AT,
};

const callbackInput = {
  limenApiUrl: "https://api.example.test",
  repositoryId: String(REPOSITORY_ID),
  githubRunId: String(RUN_ID),
  githubRunAttempt: String(RUN_ATTEMPT),
  workflowRef: WORKFLOW_REF,
  commitSha: CANONICAL_SHA,
  decision: "PASS" as const,
  receiptId: null,
  evaluatedAt: EVALUATED_AT,
};

function makeRun(overallDecision: LimenRunResult["overallDecision"]): LimenRunResult {
  return {
    runId: "LM-test",
    overallDecision,
    decisions: [],
    policyVersion: "LP-test",
    evaluatedCves: [],
    skippedCves: [],
    telegraphRequestCount: 0,
    telegraphCostUsd: 0,
    telegraphRequests: [],
    baseSha: "b".repeat(40),
    headSha: CANONICAL_SHA,
    pullRequestNumber: 42,
    evaluatedAt: EVALUATED_AT,
    budgetExceeded: false,
    missingCveCount: 0,
    runReasonCode: overallDecision === "PASS" ? "NO_RELEVANT_VULNERABILITY" : "TEST",
    runReasons: [],
    runSummary: "A test run summary.",
    context: {
      owner: "kaelah971",
      repo: "limen-demo",
      repository: "kaelah971/limen-demo",
      pullRequestNumber: 42,
      baseSha: "b".repeat(40),
      headSha: CANONICAL_SHA,
      actor: "octocat",
      eventName: "pull_request",
      authorAssociation: "MEMBER",
      githubRunId: RUN_ID,
      githubRunAttempt: RUN_ATTEMPT,
    },
    startedAt: EVALUATED_AT,
    completedAt: EVALUATED_AT,
  };
}

function callbackDependencies(
  fetchImpl: typeof fetch,
  getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN),
): LimenCallbackDependencies {
  return {
    core: { getIDToken },
    fetch: fetchImpl,
    timeoutMs: 100,
  };
}

describe("Limen API callback input", () => {
  it("disables empty input and normalizes HTTPS trailing slashes", () => {
    expect(parseLimenApiUrl("")).toBeUndefined();
    expect(parseLimenApiUrl("  https://api.example.test///  ")).toBe("https://api.example.test");
    expect(parseLimenApiUrl("https://api.example.test/base///")).toBe("https://api.example.test/base");
  });

  it.each([
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test?token=secret",
    "https://api.example.test/#fragment",
  ])("rejects unsafe callback URL %s", (value) => {
    expect(() => parseLimenApiUrl(value)).toThrow(/limen-api-url/);
  });

  it("parses the callback URL through the existing Action input reader", () => {
    const values: Record<string, string> = {
      "github-token": "github-token-fixture",
      "telegraph-private-key": VALID_PRIVATE_KEY,
      "telegraph-engine-url": "",
      "expected-network": "",
      "max-lookups": "5",
      "limen-api-url": " https://api.example.test/// ",
    };
    const inputs = readActionInputs({
      getInput: (name) => values[name] ?? "",
      setSecret: () => undefined,
    }, {});

    expect(inputs.limenApiUrl).toBe("https://api.example.test");
  });

  it("reads only the optional callback URL before full input validation", () => {
    expect(readOptionalLimenApiUrl({ getInput: (name) => name === "limen-api-url" ? "https://api.example.test" : "" }))
      .toBe("https://api.example.test");
  });

  it.each([
    ["missing", "", {}],
    ["malformed", "telegraph-private-key-fixture", {}],
  ] as const)("classifies %s Telegraph private key as deterministic configuration failure without leaking it", (_label, key, environment) => {
    const values: Record<string, string> = {
      "github-token": "github-token-fixture",
      "telegraph-private-key": key,
      "telegraph-engine-url": "",
      "expected-network": "",
      "max-lookups": "5",
      "limen-api-url": "https://api.example.test",
    };

    expect(() => readActionInputs({
      getInput: (name) => values[name] ?? "",
      setSecret: () => undefined,
    }, environment)).toThrow(ConfigurationError);
    try {
      readActionInputs({
        getInput: (name) => values[name] ?? "",
        setSecret: () => undefined,
      }, environment);
    } catch (error) {
      if (key !== "") {
        expect(String(error)).not.toContain(key);
      }
      expect(isDeterministicConfigurationError(error)).toBe(true);
    }
  });

  it("exposes the optional callback input without adding an API secret", async () => {
    const metadata = await readFile("action.yml", "utf8");

    expect(metadata).toContain("limen-api-url:");
    expect(metadata).toContain("Optional Limen API base URL for OIDC-authenticated repository status reporting");
    expect(metadata).not.toContain("LIMEN_API_KEY");
  });
});

describe("Limen OIDC evaluation callback", () => {
  it("does nothing when limen-api-url is absent", async () => {
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(reportLimenEvaluation({ ...callbackInput, limenApiUrl: undefined }, callbackDependencies(fetchImpl, getIDToken)))
      .resolves.toEqual({ status: "disabled" });
    expect(getIDToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests one OIDC token and posts the exact canonical callback body", async () => {
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));

    await expect(reportLimenEvaluation(callbackInput, callbackDependencies(fetchImpl, getIDToken)))
      .resolves.toEqual({ status: "reported" });
    expect(getIDToken).toHaveBeenCalledTimes(1);
    expect(getIDToken).toHaveBeenCalledWith("limen-api");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/v1/github/evaluations");
    expect(request?.method).toBe("POST");
    expect(request?.headers).toEqual({
      authorization: `Bearer ${OIDC_TOKEN}`,
      "content-type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      repositoryId: REPOSITORY_ID,
      githubRunId: RUN_ID,
      githubRunAttempt: RUN_ATTEMPT,
      workflowRef: WORKFLOW_REF,
      commitSha: CANONICAL_SHA,
      decision: "PASS",
      receiptId: null,
      evaluatedAt: EVALUATED_AT,
    });
  });

  it("never places credentials, provider payloads, or the raw JWT in the JSON body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const result = await reportLimenEvaluation({
      ...callbackInput,
      receiptId: null,
    }, callbackDependencies(fetchImpl));
    const request = fetchImpl.mock.calls[0]?.[1];
    const body = String(request?.body);

    expect(result).toEqual({ status: "reported" });
    expect(body).not.toContain("github-token");
    expect(body).not.toContain("installation-token");
    expect(body).not.toContain("telegraph-private-key");
    expect(body).not.toContain("PAYMENT-SIGNATURE");
    expect(body).not.toContain("ledger-ingest-token");
    expect(body).not.toContain("supabase-service-role-key");
    expect(body).not.toContain("telegraph-response-payload");
    expect(body).not.toContain(OIDC_TOKEN);
  });

  it("fails safely for missing or malformed trusted runtime context", async () => {
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(reportLimenEvaluation({ ...callbackInput, repositoryId: "not-a-number" }, callbackDependencies(fetchImpl, getIDToken)))
      .resolves.toMatchObject({ status: "failed", errorCode: "CALLBACK_CONTEXT_INVALID" });
    expect(getIDToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["OIDC token retrieval", async () => {
      throw new Error(`provider-token-secret ${OIDC_TOKEN}`);
    }],
    ["network", async () => {
      throw new Error("network secret response");
    }],
  ] as const)("treats %s failure as reporting failure without leaking details", async (_label, failure) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(failure);
    const getIDToken = vi.fn().mockRejectedValue(new Error(`provider-token-secret ${OIDC_TOKEN}`));
    const dependencies = _label === "network"
      ? callbackDependencies(fetchImpl)
      : callbackDependencies(fetchImpl, getIDToken);

    const result = await reportLimenEvaluation(callbackInput, dependencies);

    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain(OIDC_TOKEN);
    expect(JSON.stringify(result)).not.toContain("provider-token-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(_label === "network" ? 1 : 0);
  });

  it("treats every non-2xx response as one sanitized reporting failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("supabase-service-role-key payment-signature raw-provider-payload", { status: 409 }),
    );

    const result = await reportLimenEvaluation(callbackInput, callbackDependencies(fetchImpl));

    expect(result).toMatchObject({ status: "failed", httpStatus: 409 });
    expect(JSON.stringify(result)).not.toContain("supabase-service-role-key");
    expect(JSON.stringify(result)).not.toContain("payment-signature");
    expect(JSON.stringify(result)).not.toContain("raw-provider-payload");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry and reports timeout without changing the canonical result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
      }),
    );
    const result = makeRun("PASS");
    const callbackResult = await reportLimenEvaluation({
      ...callbackInput,
      decision: result.overallDecision,
      commitSha: result.headSha,
    }, { ...callbackDependencies(fetchImpl), timeoutMs: 5 });

    expect(callbackResult).toMatchObject({ status: "failed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.overallDecision).toBe("PASS");
    expect(result.headSha).toBe(CANONICAL_SHA);
  });
});

describe("Limen integration health callback", () => {
  it("does nothing when limen-api-url is absent", async () => {
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(reportLimenIntegrationFault(
      { ...healthCallbackInput, limenApiUrl: undefined },
      callbackDependencies(fetchImpl, getIDToken),
    )).resolves.toEqual({ status: "disabled" });
    expect(getIDToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests the limen-api OIDC audience and posts only CONFIGURATION_INVALID health data", async () => {
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));

    await expect(reportLimenIntegrationFault(healthCallbackInput, callbackDependencies(fetchImpl, getIDToken)))
      .resolves.toEqual({ status: "reported" });
    expect(getIDToken).toHaveBeenCalledOnce();
    expect(getIDToken).toHaveBeenCalledWith("limen-api");
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/v1/github/integration-health");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      repositoryId: REPOSITORY_ID,
      githubRunId: RUN_ID,
      githubRunAttempt: RUN_ATTEMPT,
      workflowRef: WORKFLOW_REF,
      code: "CONFIGURATION_INVALID",
      observedAt: EVALUATED_AT,
    });
    expect(String(request?.body)).not.toContain(OIDC_TOKEN);
    expect(String(request?.body)).not.toMatch(/PASS|HOLD|REVIEW/);
    expect(String(request?.body)).not.toContain("telegraph-private-key-fixture");
    expect(JSON.stringify(await reportLimenIntegrationFault(healthCallbackInput, callbackDependencies(fetchImpl, getIDToken))))
      .not.toContain(OIDC_TOKEN);
  });

  it("preserves the original configuration failure when health reporting fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("private-health-error"));
    const result = await reportLimenIntegrationFault(healthCallbackInput, callbackDependencies(fetchImpl));

    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain("private-health-error");
    expect(JSON.stringify(result)).not.toContain(OIDC_TOKEN);
  });
});

describe("callback timing and legacy Action outcomes", () => {
  it("is inserted after canonical result/receipt handling and before final outcome handling", async () => {
    const source = await readFile("action/src/main.ts", "utf8");
    const resultIndex = source.indexOf("const outputResult = await persistActionLedger");
    const callbackIndex = source.indexOf("const callback = await reportLimenEvaluation");
    const outcomeIndex = source.indexOf("applyActionOutcome(outputResult)");

    expect(resultIndex).toBeGreaterThanOrEqual(0);
    expect(callbackIndex).toBeGreaterThan(resultIndex);
    expect(callbackIndex).toBeLessThan(outcomeIndex);
    expect(source).toContain("decision: outputResult.overallDecision");
    expect(source).toContain("commitSha: outputResult.headSha");
    expect(source).toContain("reportLimenIntegrationFault");
    expect(source).toContain("CONFIGURATION_INVALID");
    expect(source).toContain("readOptionalLimenApiUrl");
  });

  it.each([
    ["PASS", "notice", false],
    ["HOLD", "error", true],
    ["REVIEW", "warning", true],
  ] as const)("preserves %s exit behavior when callback reporting succeeds", async (decision, method, shouldFail) => {
    const events: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const callbackResult = await reportLimenEvaluation({
      ...callbackInput,
      decision,
      commitSha: makeRun(decision).headSha,
    }, callbackDependencies(fetchImpl));
    events.push(`callback:${callbackResult.status}`);
    const runtime: ActionOutcomeRuntime = {
      notice: (message) => events.push(`notice:${message}`),
      error: (message) => events.push(`error:${message}`),
      warning: (message) => events.push(`warning:${message}`),
      setFailed: (message) => events.push(`failed:${message}`),
    };

    applyActionOutcome(makeRun(decision), runtime);

    expect(events[0]).toBe("callback:reported");
    expect(events.some((event) => event.startsWith(`${method}:`))).toBe(true);
    expect(events.some((event) => event.startsWith("failed:"))).toBe(shouldFail);
  });

  it.each(["PASS", "HOLD", "REVIEW"] as const)("preserves %s exit behavior when callback fails", async (decision) => {
    const events: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("callback private secret"));
    const callbackResult = await reportLimenEvaluation({
      ...callbackInput,
      decision,
      commitSha: makeRun(decision).headSha,
    }, callbackDependencies(fetchImpl));
    if (callbackResult.status === "failed") {
      events.push("warning:Limen evaluation completed, but repository status reporting failed.");
    }
    const runtime: ActionOutcomeRuntime = {
      notice: (message) => events.push(`notice:${message}`),
      error: (message) => events.push(`error:${message}`),
      warning: (message) => events.push(`warning:${message}`),
      setFailed: (message) => events.push(`failed:${message}`),
    };

    applyActionOutcome(makeRun(decision), runtime);

    expect(events[0]).toBe("warning:Limen evaluation completed, but repository status reporting failed.");
    expect(events.some((event) => event.startsWith("failed:"))).toBe(decision !== "PASS");
    expect(events.join("\n")).not.toContain("callback private secret");
    expect(events.join("\n")).not.toContain(OIDC_TOKEN);
  });

  it("keeps legacy behavior when callback is disabled", async () => {
    const events: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>();
    const getIDToken = vi.fn().mockResolvedValue(OIDC_TOKEN);
    const callbackResult = await reportLimenEvaluation(
      { ...callbackInput, limenApiUrl: undefined },
      callbackDependencies(fetchImpl, getIDToken),
    );
    const runtime: ActionOutcomeRuntime = {
      notice: (message) => events.push(`notice:${message}`),
      error: (message) => events.push(`error:${message}`),
      warning: (message) => events.push(`warning:${message}`),
      setFailed: (message) => events.push(`failed:${message}`),
    };
    applyActionOutcome(makeRun("PASS"), runtime);

    expect(callbackResult).toEqual({ status: "disabled" });
    expect(getIDToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(events.some((event) => event.startsWith("notice:"))).toBe(true);
    expect(events.some((event) => event.startsWith("failed:"))).toBe(false);
  });

  it("uses only the final canonical decision and SHA supplied by the result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const result = makeRun("REVIEW");

    await reportLimenEvaluation({
      ...callbackInput,
      decision: result.overallDecision,
      commitSha: result.headSha,
    }, callbackDependencies(fetchImpl));

    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      decision: "REVIEW",
      commitSha: CANONICAL_SHA,
    });
  });

  it("retains no second orchestration path", async () => {
    const source = await readFile("action/src/orchestrate.ts", "utf8");
    expect(source).not.toContain("getIDToken");
    expect(source).not.toContain("v1/github/evaluations");
    expect(source).not.toContain("reportLimenEvaluation");
  });
});
