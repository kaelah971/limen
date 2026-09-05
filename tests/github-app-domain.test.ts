import { describe, expect, it } from "vitest";
import {
  GitHubAppStateError,
  REPOSITORY_LIFECYCLE_STATES,
  loadGitHubAppConfig,
  transitionRepositoryState,
  type LimenReleaseDecision,
} from "../packages/github-app/src";

const ESCAPED_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\\nfixture\\n-----END PRIVATE KEY-----";
const NORMALIZED_PRIVATE_KEY = ESCAPED_PRIVATE_KEY.replace(/\\n/g, "\n");
const WEBHOOK_SECRET = "fixture-webhook-secret-0123456789abcdef";
const ACTION_SHA = "0123456789abcdef0123456789abcdef01234567";

const VALID_ENVIRONMENT: Record<string, string | undefined> = {
  GITHUB_APP_ID: "12345",
  GITHUB_APP_SLUG: "limen",
  GITHUB_APP_PRIVATE_KEY: ESCAPED_PRIVATE_KEY,
  GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
  LIMEN_ACTION_SHA: ACTION_SHA,
};

function environmentWith(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { ...VALID_ENVIRONMENT, ...overrides };
}

function environmentWithout(key: string): Record<string, string | undefined> {
  const environment = environmentWith();
  delete environment[key];
  return environment;
}

function thrownMessage(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected action to throw.");
}

describe("GitHub App repository lifecycle domain", () => {
  it("defines lifecycle states separately from release decisions", () => {
    expect(REPOSITORY_LIFECYCLE_STATES).toEqual([
      "SETUP_REQUIRED",
      "SETUP_PR_OPEN",
      "CONFIGURED",
      "VERIFIED",
      "NEEDS_ATTENTION",
      "DISCONNECTED",
    ]);
    expect(REPOSITORY_LIFECYCLE_STATES).not.toContain("REVIEW");

    const releaseDecisions: LimenReleaseDecision[] = ["PASS", "HOLD", "REVIEW"];
    expect(releaseDecisions).toEqual(["PASS", "HOLD", "REVIEW"]);
  });

  it.each([
    ["SETUP_REQUIRED", "SETUP_PR_OPENED", "SETUP_PR_OPEN"],
    ["SETUP_PR_OPEN", "SETUP_PR_MERGED", "CONFIGURED"],
    ["CONFIGURED", "EVALUATION_ACCEPTED", "VERIFIED"],
    ["SETUP_PR_OPEN", "SETUP_PR_CLOSED", "SETUP_REQUIRED"],
    ["VERIFIED", "INTEGRATION_FAULT", "NEEDS_ATTENTION"],
    ["VERIFIED", "DISCONNECTED", "DISCONNECTED"],
    ["DISCONNECTED", "RECONNECTED", "SETUP_REQUIRED"],
  ] as const)("transitions %s + %s to %s", (current, event, expected) => {
    expect(transitionRepositoryState(current, event)).toBe(expected);
  });

  it("throws a typed error for invalid transitions", () => {
    expect(() => transitionRepositoryState("SETUP_REQUIRED", "SETUP_PR_MERGED"))
      .toThrowError(GitHubAppStateError);
  });
});

describe("GitHub App configuration", () => {
  it("loads and normalizes the validated configuration", () => {
    expect(loadGitHubAppConfig(environmentWith())).toEqual({
      appId: 12345,
      appSlug: "limen",
      privateKey: NORMALIZED_PRIVATE_KEY,
      webhookSecret: WEBHOOK_SECRET,
      oidcAudience: "limen-api",
      actionSha: ACTION_SHA,
    });
  });

  it.each(["0", "-1", "1.5", "not-a-number", undefined])
    ("requires a positive integer GITHUB_APP_ID: %s", (appId) => {
      expect(() => loadGitHubAppConfig(environmentWith({ GITHUB_APP_ID: appId })))
        .toThrow(/GITHUB_APP_ID/);
    });

  it.each([undefined, "", "   "])("requires a non-empty GITHUB_APP_SLUG: %s", (appSlug) => {
    expect(() => loadGitHubAppConfig(environmentWith({ GITHUB_APP_SLUG: appSlug })))
      .toThrow(/GITHUB_APP_SLUG/);
  });

  it("requires GITHUB_APP_PRIVATE_KEY and accepts escaped PEM newlines", () => {
    expect(() => loadGitHubAppConfig(environmentWithout("GITHUB_APP_PRIVATE_KEY")))
      .toThrow(/GITHUB_APP_PRIVATE_KEY/);
    expect(loadGitHubAppConfig(environmentWith({
      GITHUB_APP_PRIVATE_KEY: ESCAPED_PRIVATE_KEY,
    })).privateKey).toBe(NORMALIZED_PRIVATE_KEY);
  });

  it.each([undefined, "short"])("requires a 32-character GITHUB_WEBHOOK_SECRET: %s", (secret) => {
    expect(() => loadGitHubAppConfig(environmentWith({ GITHUB_WEBHOOK_SECRET: secret })))
      .toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it("uses limen-api as the default OIDC audience and accepts a configured literal", () => {
    expect(loadGitHubAppConfig(environmentWithout("LIMEN_GITHUB_OIDC_AUDIENCE")).oidcAudience)
      .toBe("limen-api");
    expect(loadGitHubAppConfig(environmentWith({
      LIMEN_GITHUB_OIDC_AUDIENCE: "custom-limen-audience",
    })).oidcAudience).toBe("custom-limen-audience");
  });

  it.each([undefined, "", "not-40-hex", `${"g".repeat(40)}`, `${"a".repeat(39)}`])
    ("requires exactly 40 hexadecimal LIMEN_ACTION_SHA: %s", (actionSha) => {
      expect(() => loadGitHubAppConfig(environmentWith({ LIMEN_ACTION_SHA: actionSha })))
        .toThrow(/LIMEN_ACTION_SHA/);
    });

  it("does not expose private configuration values in validation errors", () => {
    const privateKeyMessage = thrownMessage(() => loadGitHubAppConfig(environmentWith({
      GITHUB_APP_PRIVATE_KEY: "private-key-value",
    })));
    const webhookSecretMessage = thrownMessage(() => loadGitHubAppConfig(environmentWith({
      GITHUB_WEBHOOK_SECRET: "webhook-secret-value",
    })));

    expect(privateKeyMessage).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(privateKeyMessage).not.toContain("private-key-value");
    expect(webhookSecretMessage).toContain("GITHUB_WEBHOOK_SECRET");
    expect(webhookSecretMessage).not.toContain("webhook-secret-value");
  });
});
