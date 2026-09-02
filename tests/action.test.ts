import { readFile } from "node:fs/promises";
import * as actionsCore from "@actions/core";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  ConfigurationError,
  LimenPolicyNotFoundError,
  LimenPolicyValidationError,
  TelegraphEngineError,
  TelegraphRoutingError,
  parseLimenPolicy,
  type TelegraphCveEvidence,
} from "../packages/core/src";
import {
  GitHubAdvisoryNotFoundError,
  GitHubApiError,
  GitHubDependencySnapshotWarningError,
  GitHubClient,
  type GitHubDependencyReviewChangeDto,
  type GitHubGlobalAdvisoryDto,
} from "../packages/github/src";
import {
  applyActionOutcome,
  createTelegraphFactory,
  formatActionError,
  type ActionOutcomeRuntime,
} from "../action/src/main";
import { aggregateDecisions } from "../action/src/aggregate";
import { parsePullRequestContext } from "../action/src/context";
import { readActionInputs, parseMaxLookups } from "../action/src/inputs";
import { loadBaseCommitPolicy } from "../action/src/policy";
import { orchestrateLimenRun } from "../action/src/orchestrate";
import { setActionOutputs } from "../action/src/outputs";
import { renderSummary } from "../action/src/summary";
import type {
  ActionPullRequestContext,
  LimenRunResult,
} from "../action/src/types";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const POLICY_SOURCE = `production:
  block_severity: [critical, high]
  dependency_scopes: [runtime]
`;
const policy = parseLimenPolicy(POLICY_SOURCE);
const actionContext: ActionPullRequestContext = {
  owner: "owner",
  repo: "repo",
  repository: "owner/repo",
  pullRequestNumber: 42,
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
  actor: "octocat",
  eventName: "pull_request",
  authorAssociation: "MEMBER",
};

const metadata = {
  status: 200,
  rateLimit: { remaining: 4999, reset: 1760000000 },
  requestId: "request-1",
};

function makeChange(
  index: number,
  options: { cveId?: string | null; severity?: string; name?: string } = {},
): GitHubDependencyReviewChangeDto {
  const name = options.name ?? `package-${index}`;
  const ghsaId = `GHSA-TEST-${String(index).padStart(4, "0")}-LIMEN`;
  return {
    change_type: "added",
    manifest: "package-lock.json",
    ecosystem: "npm",
    name,
    version: "1.0.0",
    package_url: null,
    license: null,
    source_repository_url: null,
    scope: "runtime",
    relationship: "direct",
    vulnerabilities: [{
      severity: options.severity ?? "low",
      advisory_ghsa_id: ghsaId,
      advisory_summary: "A test advisory",
      advisory_url: `https://github.com/advisories/${ghsaId}`,
    }],
  };
}

function makeAdvisory(
  index: number,
  options: { cveId?: string | null; severity?: string; name?: string } = {},
): GitHubGlobalAdvisoryDto {
  const name = options.name ?? `package-${index}`;
  const ghsaId = `GHSA-TEST-${String(index).padStart(4, "0")}-LIMEN`;
  return {
    ghsa_id: ghsaId,
    cve_id: options.cveId === undefined
      ? `CVE-2024-${String(index).padStart(4, "0")}`
      : options.cveId,
    summary: "A test advisory",
    description: "A test vulnerability description.",
    severity: options.severity ?? "low",
    identifiers: [
      { type: "GHSA", value: ghsaId },
      ...(options.cveId === null
        ? []
        : [{ type: "CVE", value: options.cveId ?? `CVE-2024-${String(index).padStart(4, "0")}` }]),
    ],
    references: [],
    vulnerabilities: [{
      package: { ecosystem: "npm", name },
      vulnerable_version_range: "<2.0.0",
      first_patched_version: "2.0.0",
      vulnerable_functions: [],
    }],
    cvss: { score: 4.2 },
    cvss_severities: null,
  };
}

function makeTelegraphEvidence(
  cveId: string,
  severity: TelegraphCveEvidence["severity"] = "LOW",
): TelegraphCveEvidence {
  return {
    cveId,
    severity,
    cvssScore: 4.2,
    description: "A routed test result.",
    references: [],
    affectedVersions: ["<2.0.0"],
    fixedVersions: ["2.0.0"],
    fixAvailable: true,
    intent: "CVE_LOOKUP",
    minerId: "miner-test",
    minerName: "Test Miner",
    timestamp: null,
    reasoning: null,
    endpoint: null,
    costUsd: 0.01,
    durationMs: 100,
    network: "eip155:84532",
    paymentScheme: "exact",
    requestedAt: "2026-09-02T10:00:00.000Z",
    receivedAt: "2026-09-02T10:00:00.100Z",
    raw: {},
  };
}

function makeGitHubClient(
  changes: GitHubDependencyReviewChangeDto[],
  advisories = new Map<string, GitHubGlobalAdvisoryDto>(),
): GitHubClient & {
  compareDependencies: ReturnType<typeof vi.fn>;
  getGlobalAdvisory: ReturnType<typeof vi.fn>;
  getRepositoryFile: ReturnType<typeof vi.fn>;
} {
  return {
    compareDependencies: vi.fn().mockResolvedValue({
      data: { changes, warnings: [] },
      metadata,
    }),
    getGlobalAdvisory: vi.fn().mockImplementation(async ({ ghsaId }: { ghsaId: string }) => {
      const advisory = advisories.get(ghsaId);
      if (advisory === undefined) {
        throw new GitHubAdvisoryNotFoundError("Advisory not found.");
      }
      return { data: advisory, metadata };
    }),
    listDependabotAlerts: vi.fn(),
    getRepositoryFile: vi.fn(),
  } as unknown as GitHubClient & {
    compareDependencies: ReturnType<typeof vi.fn>;
    getGlobalAdvisory: ReturnType<typeof vi.fn>;
    getRepositoryFile: ReturnType<typeof vi.fn>;
  };
}

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
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    pullRequestNumber: 42,
    evaluatedAt: "2026-09-02T10:00:00.000Z",
    budgetExceeded: false,
    missingCveCount: 0,
    runReasonCode: overallDecision === "PASS" ? "NO_RELEVANT_VULNERABILITY" : "TEST",
    runReasons: [],
    runSummary: "A test run summary.",
    context: actionContext,
    startedAt: "2026-09-02T10:00:00.000Z",
    completedAt: "2026-09-02T10:00:00.000Z",
  };
}

describe("P3 action context and inputs", () => {
  it("extracts validated PR context with full base and head SHAs", () => {
    expect(parsePullRequestContext({
      eventName: "pull_request",
      owner: "owner",
      repo: "repo",
      actor: "octocat",
      payload: {
        pull_request: {
          number: 42,
          base: { sha: BASE_SHA },
          head: { sha: HEAD_SHA },
          author_association: "member",
          user: { login: "author" },
        },
        sender: { login: "sender" },
      },
    })).toEqual(actionContext);
  });

  it("supports pull_request_target and rejects unsupported or abbreviated context", () => {
    const payload = {
      pull_request: {
        number: 1,
        base: { sha: BASE_SHA },
        head: { sha: HEAD_SHA },
      },
    };
    expect(parsePullRequestContext({
      eventName: "pull_request_target",
      owner: "owner",
      repo: "repo",
      payload,
    }).eventName).toBe("pull_request_target");
    expect(() => parsePullRequestContext({
      eventName: "push",
      owner: "owner",
      repo: "repo",
      payload,
    })).toThrow();
    expect(() => parsePullRequestContext({
      eventName: "pull_request",
      owner: "owner",
      repo: "repo",
      payload: {
        pull_request: {
          number: 1,
          base: { sha: "abcdef1" },
          head: { sha: HEAD_SHA },
        },
      },
    })).toThrow();
  });

  it("bounds max-lookups and masks both action credentials when read", () => {
    expect(parseMaxLookups("1")).toBe(1);
    expect(parseMaxLookups("20")).toBe(20);
    expect(() => parseMaxLookups("0")).toThrowError(ConfigurationError);
    expect(() => parseMaxLookups("21")).toThrowError(ConfigurationError);
    expect(() => parseMaxLookups("five")).toThrowError(ConfigurationError);

    const secrets: string[] = [];
    const values: Record<string, string> = {
      "github-token": "github-example",
      "telegraph-private-key": "",
      "telegraph-engine-url": "",
      "expected-network": "",
      "max-lookups": "7",
    };
    const inputs = readActionInputs({
      getInput: (name) => values[name] ?? "",
      setSecret: (value) => secrets.push(value),
    }, {
      TELEGRAPH_PRIVATE_KEY: "environment-example",
      TELEGRAPH_ENGINE_URL: "https://engine.example.test/v1/ask",
    });

    expect(inputs.maxLookups).toBe(7);
    expect(inputs.telegraphPrivateKey).toBe("environment-example");
    expect(secrets).toEqual(["github-example", "environment-example"]);
  });

  it("passes Action inputs through Telegraph configuration validation", () => {
    const values: Record<string, string> = {
      "github-token": "github-example",
      "telegraph-private-key": `0x${"b".repeat(64)}`,
      "telegraph-engine-url": "http://13.237.89.59:7044/engine/v1/ask",
      "expected-network": "",
      "max-lookups": "5",
    };
    const inputs = readActionInputs({
      getInput: (name) => values[name] ?? "",
      setSecret: () => undefined,
    }, {});
    const factory = createTelegraphFactory(inputs, {});

    expect(factory).toBeDefined();
    expect(() => factory?.()).not.toThrow();
  });

  it("reads hyphenated inputs through the real Actions toolkit", () => {
    const environmentKeys = [
      "INPUT_GITHUB-TOKEN",
      "INPUT_TELEGRAPH-PRIVATE-KEY",
      "INPUT_TELEGRAPH-ENGINE-URL",
      "INPUT_EXPECTED-NETWORK",
      "INPUT_MAX-LOOKUPS",
    ];
    const previousValues = new Map(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    try {
      process.env["INPUT_GITHUB-TOKEN"] = "github-example";
      process.env["INPUT_TELEGRAPH-PRIVATE-KEY"] = `0x${"d".repeat(64)}`;
      process.env["INPUT_TELEGRAPH-ENGINE-URL"] =
        "http://13.237.89.59:7044/engine/v1/ask";
      process.env["INPUT_EXPECTED-NETWORK"] = "";
      process.env["INPUT_MAX-LOOKUPS"] = "5";

      const inputs = readActionInputs({
        getInput: (name, options) => actionsCore.getInput(name, options),
        setSecret: () => undefined,
      }, {});
      const factory = createTelegraphFactory(inputs, {});

      expect(factory).toBeDefined();
      expect(() => factory?.()).not.toThrow();
    } finally {
      for (const key of environmentKeys) {
        const previousValue = previousValues.get(key);
        if (previousValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previousValue;
        }
      }
    }
  });

  it("logs safe configuration diagnostics without including a private key", async () => {
    const privateKey = `0x${"c".repeat(64)}`;
    const invalidKey = privateKey.slice(0, -1);
    let error: unknown;
    try {
      const inputs = readActionInputs({
        getInput: (name) => ({
          "github-token": "github-example",
          "telegraph-private-key": invalidKey,
          "telegraph-engine-url": "http://13.237.89.59:7044/engine/v1/ask",
          "expected-network": "",
          "max-lookups": "5",
        })[name] ?? "",
        setSecret: () => undefined,
      }, {});
      createTelegraphFactory(inputs, {})?.();
    } catch (caught) {
      error = caught;
    }

    const message = formatActionError(error);
    expect(message).not.toContain(privateKey);
    expect(message).toContain("TELEGRAPH_PRIVATE_KEY");
    expect(message).toContain("trimmedLength");
    expect(message).toContain("matchesRequiredPattern");
  });
});

describe("base policy retrieval", () => {
  it("loads limen.yml from the base SHA and never asks GitHub for head policy", async () => {
    const github = makeGitHubClient([]);
    github.getRepositoryFile.mockResolvedValue({
      data: {
        type: "file",
        encoding: "base64",
        content: Buffer.from(POLICY_SOURCE, "utf8").toString("base64"),
        path: "limen.yml",
      },
      metadata,
    });

    const loaded = await loadBaseCommitPolicy(github, actionContext);

    expect(loaded.version).toBe(policy.version);
    expect(github.getRepositoryFile).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: "limen.yml",
      ref: BASE_SHA,
    });
    expect(github.getRepositoryFile.mock.calls.every((call) => call[0].ref === BASE_SHA)).toBe(true);
  });

  it("uses limen.yaml only after base limen.yml is not found", async () => {
    const github = makeGitHubClient([]);
    github.getRepositoryFile
      .mockRejectedValueOnce(new GitHubApiError("not found", { status: 404 }))
      .mockResolvedValueOnce({
        data: {
          type: "file",
          encoding: "base64",
          content: Buffer.from(POLICY_SOURCE, "utf8").toString("base64"),
          path: "limen.yaml",
        },
        metadata,
      });

    await expect(loadBaseCommitPolicy(github, actionContext)).resolves.toMatchObject({
      version: policy.version,
    });
    expect(github.getRepositoryFile.mock.calls.map((call) => call[0].path)).toEqual([
      "limen.yml",
      "limen.yaml",
    ]);
  });

  it("fails when neither policy filename exists or the base policy is invalid", async () => {
    const missing = makeGitHubClient([]);
    missing.getRepositoryFile.mockRejectedValue(new GitHubApiError("not found", { status: 404 }));
    await expect(loadBaseCommitPolicy(missing, actionContext)).rejects.toThrowError(
      LimenPolicyNotFoundError,
    );

    const invalid = makeGitHubClient([]);
    invalid.getRepositoryFile.mockResolvedValue({
      data: {
        type: "file",
        encoding: "base64",
        content: Buffer.from("production:\n  block_severity: [unknown]\n  dependency_scopes: [runtime]\n", "utf8").toString("base64"),
        path: "limen.yml",
      },
      metadata,
    });
    await expect(loadBaseCommitPolicy(invalid, actionContext)).rejects.toThrowError(
      LimenPolicyValidationError,
    );
  });
});

describe("P3 orchestration", () => {
  it("passes without initializing Telegraph when no relevant vulnerability exists", async () => {
    const github = makeGitHubClient([{
      ...makeChange(1),
      vulnerabilities: [],
    }]);
    const telegraphFactory = vi.fn();
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: { githubClient: github, telegraphClientFactory: telegraphFactory },
    });

    expect(result).toMatchObject({
      overallDecision: "PASS",
      runReasonCode: "NO_RELEVANT_VULNERABILITY",
      decisions: [],
      telegraphRequestCount: 0,
      telegraphCostUsd: 0,
    });
    expect(telegraphFactory).not.toHaveBeenCalled();
  });

  it("uses base policy, performs one paid lookup, and returns a canonical HOLD", async () => {
    const change = makeChange(1, { severity: "high" });
    const advisory = makeAdvisory(1, { severity: "high" });
    const github = makeGitHubClient([change], new Map([[advisory.ghsa_id, advisory]]));
    const lookupCve = vi.fn().mockResolvedValue(makeTelegraphEvidence("CVE-2024-0001", "HIGH"));
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({ lookupCve }),
        now: () => new Date("2026-09-02T10:00:00.000Z"),
        createRunId: () => "LM-fixed",
      },
    });

    expect(result).toMatchObject({
      overallDecision: "HOLD",
      runReasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
      evaluatedCves: ["CVE-2024-0001"],
      telegraphRequestCount: 1,
      telegraphCostUsd: 0.01,
    });
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.decision).toBe("HOLD");
    expect(lookupCve).toHaveBeenCalledWith({
      cveId: "CVE-2024-0001",
      packageName: "package-1",
      installedVersion: "1.0.0",
      repository: "owner/repo",
    });
  });

  it("converts Telegraph failures and missing payment credentials to P1 REVIEW", async () => {
    const change = makeChange(1);
    const advisory = makeAdvisory(1);
    const github = makeGitHubClient([change], new Map([[advisory.ghsa_id, advisory]]));
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({
          lookupCve: vi.fn().mockRejectedValue(new TelegraphEngineError("engine unavailable")),
        }),
      },
    });
    expect(result.overallDecision).toBe("REVIEW");
    expect(result.decisions[0]?.reasonCode).toBe("TELEGRAPH_UNAVAILABLE");
    expect(result.telegraphRequestCount).toBe(1);

    const wrongIntent = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({
          lookupCve: vi.fn().mockRejectedValue(new TelegraphRoutingError("wrong intent")),
        }),
      },
    });
    expect(wrongIntent).toMatchObject({
      overallDecision: "REVIEW",
      runReasonCode: "TELEGRAPH_UNAVAILABLE",
    });

    const noKey = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: { githubClient: github },
    });
    expect(noKey).toMatchObject({
      overallDecision: "REVIEW",
      telegraphRequestCount: 0,
      runReasonCode: "TELEGRAPH_UNAVAILABLE",
    });
  });

  it("deduplicates the paid lookup while evaluating every canonical evidence pair", async () => {
    const first = makeChange(1, { name: "package-a" });
    const second = makeChange(1, { name: "package-b" });
    const advisory = makeAdvisory(1, { name: "package-a" });
    const firstVulnerability = advisory.vulnerabilities?.[0];
    if (firstVulnerability === undefined) {
      throw new Error("Expected the advisory fixture to contain a vulnerability.");
    }
    advisory.vulnerabilities = [...(advisory.vulnerabilities ?? []), {
      ...firstVulnerability,
      package: { ecosystem: "npm", name: "package-b" },
    }];
    const github = makeGitHubClient(
      [first, second],
      new Map([[advisory.ghsa_id, advisory]]),
    );
    const lookupCve = vi.fn().mockResolvedValue(makeTelegraphEvidence("CVE-2024-0001"));
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({ lookupCve }),
      },
    });

    expect(lookupCve).toHaveBeenCalledTimes(1);
    expect(result.decisions).toHaveLength(2);
    expect(result.telegraphRequestCount).toBe(1);
  });

  it("retries snapshot warnings three times with bounded backoff and then reviews", async () => {
    const github = makeGitHubClient([]);
    github.compareDependencies
      .mockRejectedValueOnce(new GitHubDependencySnapshotWarningError("stale"))
      .mockRejectedValueOnce(new GitHubDependencySnapshotWarningError("stale"))
      .mockResolvedValueOnce({ data: { changes: [], warnings: [] }, metadata });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const pass = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: { githubClient: github, sleep },
    });
    expect(pass.overallDecision).toBe("PASS");
    expect(github.compareDependencies).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);

    github.compareDependencies.mockRejectedValue(new GitHubDependencySnapshotWarningError("stale"));
    const review = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: { githubClient: github, sleep: async () => undefined },
    });
    expect(review).toMatchObject({
      overallDecision: "REVIEW",
      runReasonCode: "DEPENDENCY_SNAPSHOT_UNAVAILABLE",
      telegraphRequestCount: 0,
    });
  });

  it("reviews affected advisories without a CVE and never sends a GHSA to Telegraph", async () => {
    const change = makeChange(1, { cveId: null });
    const advisory = makeAdvisory(1, { cveId: null });
    const github = makeGitHubClient([change], new Map([[advisory.ghsa_id, advisory]]));
    const lookupCve = vi.fn();
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({ lookupCve }),
      },
    });

    expect(result).toMatchObject({
      overallDecision: "REVIEW",
      runReasonCode: "CVE_IDENTITY_UNAVAILABLE",
      missingCveCount: 1,
      telegraphRequestCount: 0,
    });
    expect(lookupCve).not.toHaveBeenCalled();
  });

  it("sorts unique CVEs by repository severity then CVE and marks budget overflow", async () => {
    const changes = [
      makeChange(1, { severity: "low" }),
      makeChange(2, { severity: "high" }),
      makeChange(3, { severity: "medium" }),
      makeChange(4, { severity: "low" }),
      makeChange(5, { severity: "low" }),
      makeChange(6, { severity: "low" }),
      makeChange(7, { severity: "low" }),
    ];
    const advisories = new Map(
      changes.map((change, index) => [
        change.vulnerabilities[0]?.advisory_ghsa_id ?? "",
        makeAdvisory(index + 1, {
          severity: index === 1 ? "high" : index === 2 ? "medium" : "low",
        }),
      ]),
    );
    const github = makeGitHubClient(changes, advisories);
    const lookupCve = vi.fn().mockImplementation(({ cveId }: { cveId: string }) => {
      const severity = cveId === "CVE-2024-0002"
        ? "HIGH"
        : cveId === "CVE-2024-0003"
          ? "MEDIUM"
          : "LOW";
      return Promise.resolve(makeTelegraphEvidence(cveId, severity));
    });
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy: parseLimenPolicy(`production:
  block_severity: [critical]
  dependency_scopes: [runtime]
`),
      maxLookups: 5,
      dependencies: {
        githubClient: github,
        telegraphClientFactory: () => ({ lookupCve }),
      },
    });

    expect(lookupCve).toHaveBeenCalledTimes(5);
    expect(result.evaluatedCves).toEqual([
      "CVE-2024-0002",
      "CVE-2024-0003",
      "CVE-2024-0001",
      "CVE-2024-0004",
      "CVE-2024-0005",
    ]);
    expect(result.skippedCves).toEqual(["CVE-2024-0006", "CVE-2024-0007"]);
    expect(result).toMatchObject({
      overallDecision: "REVIEW",
      budgetExceeded: true,
      runReasonCode: "LOOKUP_BUDGET_EXCEEDED",
    });

    const holdGithub = makeGitHubClient(changes, advisories);
    const holdResult = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: 1,
      dependencies: {
        githubClient: holdGithub,
        telegraphClientFactory: () => ({
          lookupCve: vi.fn().mockImplementation(({ cveId }: { cveId: string }) =>
            Promise.resolve(makeTelegraphEvidence(cveId, cveId === "CVE-2024-0002" ? "HIGH" : "LOW"))),
        }),
      },
    });
    expect(holdResult).toMatchObject({
      overallDecision: "HOLD",
      budgetExceeded: true,
      runReasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
    });
  });
});

describe("P3 aggregation, UX, and build boundaries", () => {
  it.each([
    ["PASS", "PASS", "PASS"],
    ["PASS", "REVIEW", "REVIEW"],
    ["REVIEW", "REVIEW", "REVIEW"],
    ["PASS", "HOLD", "HOLD"],
    ["REVIEW", "HOLD", "HOLD"],
  ] as const)("aggregates %s + %s as %s", (left, right, expected) => {
    const decision = (value: "PASS" | "HOLD" | "REVIEW") => ({ decision: value, reasonCode: "TEST" }) as never;
    expect(aggregateDecisions(
      [decision(left), decision(right)],
      { budgetExceeded: false, runReasons: [], noRelevantVulnerabilities: false },
    ).overallDecision).toBe(expected);
  });

  it("writes safe stable outputs and keeps HOLD/REVIEW visibly distinct", () => {
    const values: Record<string, string> = {};
    setActionOutputs(makeRun("PASS"), {
      setOutput: (name, value) => { values[name] = value; },
    });
    expect(values).toMatchObject({
      decision: "PASS",
      "run-id": "LM-test",
      "policy-version": "LP-test",
      "evaluated-cves": "[]",
      "telegraph-cost-usd": "0.000000",
    });

    const summary = renderSummary(makeRun("REVIEW"));
    expect(summary).toContain("# Limen: REVIEW");
    expect(summary).toContain("Human review is required");
    expect(summary).toContain("**HOLD:** evidence is sufficient; policy says stop.");
    expect(summary).toContain("**REVIEW:** evidence is insufficient");
    expect(summary).not.toContain("private-key");
  });

  it.each([
    ["PASS", "notice", false],
    ["HOLD", "error", true],
    ["REVIEW", "warning", true],
  ] as const)("maps %s to the correct Action result", (decision, method, shouldFail) => {
    const calls: string[] = [];
    const runtime: ActionOutcomeRuntime = {
      notice: (message) => calls.push(`notice:${message}`),
      error: (message) => calls.push(`error:${message}`),
      warning: (message) => calls.push(`warning:${message}`),
      setFailed: (message) => calls.push(`failed:${message}`),
    };
    applyActionOutcome(makeRun(decision), runtime);
    expect(calls.some((call) => call.startsWith(`${method}:`))).toBe(true);
    expect(calls.some((call) => call.startsWith("failed:"))).toBe(shouldFail);
  });

  it("points action metadata at the bundled Node 24 entrypoint", async () => {
    const metadata = parse(await readFile("action.yml", "utf8")) as {
      runs: { using: string; main: string };
      inputs: Record<string, unknown>;
      outputs: Record<string, unknown>;
    };
    expect(metadata.runs).toEqual({ using: "node24", main: "action/dist/index.js" });
    expect((await readFile("action/dist/index.js", "utf8")).length).toBeGreaterThan(100_000);
    expect(Object.keys(metadata.inputs)).toEqual([
      "github-token",
      "telegraph-private-key",
      "max-lookups",
      "telegraph-engine-url",
      "expected-network",
      "ledger-url",
      "ledger-token",
      "usage-class",
    ]);
    expect(Object.keys(metadata.outputs)).toEqual([
      "decision",
      "run-id",
      "policy-version",
      "decision-count",
      "pass-count",
      "hold-count",
      "review-count",
      "evaluated-cves",
      "skipped-cves",
      "telegraph-request-count",
      "telegraph-cost-usd",
      "reason",
      "ledger-run-id",
      "ledger-persisted",
    ]);
  });

  it("has no target-repository execution primitives in Action source", async () => {
    const files = [
      "action/src/main.ts",
      "action/src/orchestrate.ts",
      "action/src/policy.ts",
      "action/src/context.ts",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(/child_process|exec\(|spawn\(|eval\(|npm install|pnpm install|yarn/);
    }
  });
});
