import * as actionsCore from "@actions/core";
import { context as githubContext } from "@actions/github";
import {
  isLimenError,
  serializeError,
} from "../../packages/core/src";
import { createGitHubClient, loadGitHubConfig } from "../../packages/github/src";
import {
  createTelegraphClient,
  loadTelegraphConfig,
  type TelegraphClient,
} from "../../packages/telegraph/src";
import { parsePullRequestContext } from "./context";
import { readActionInputs } from "./inputs";
import { loadBaseCommitPolicy } from "./policy";
import { persistActionLedger } from "./persist";
import { orchestrateLimenRun } from "./orchestrate";
import { setActionOutputs } from "./outputs";
import { renderSummary } from "./summary";
import type { ActionInputs, LimenRunResult } from "./types";

export interface ActionOutcomeRuntime {
  notice(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
}

export function formatActionError(error: unknown): string {
  const serialized = serializeError(error);
  let details = "";
  if (serialized.details !== undefined) {
    try {
      details = ` Details: ${JSON.stringify(serialized.details)}`;
    } catch {
      details = "";
    }
  }
  return `Limen failed: ${serialized.code}. ${serialized.message}${details}`;
}

export function applyActionOutcome(
  result: LimenRunResult,
  runtime: ActionOutcomeRuntime = actionsCore,
): void {
  if (result.overallDecision === "PASS") {
    runtime.notice("Limen: PASS");
    return;
  }
  if (result.overallDecision === "HOLD") {
    runtime.error(`Limen: HOLD. ${result.runSummary}`);
    runtime.setFailed(`Limen: HOLD. ${result.runSummary}`);
    return;
  }
  runtime.warning(`Limen: REVIEW. ${result.runSummary}`);
  runtime.setFailed(`Limen: REVIEW. ${result.runSummary}`);
}

export function createTelegraphFactory(
  inputs: ActionInputs,
  baseEnvironment: Record<string, string | undefined> = process.env,
): (() => TelegraphClient) | undefined {
  if (inputs.telegraphPrivateKey === undefined) {
    return undefined;
  }

  return () => {
    const environment = {
      ...baseEnvironment,
      TELEGRAPH_PRIVATE_KEY: inputs.telegraphPrivateKey,
      ...(inputs.telegraphEngineUrl === undefined
        ? {}
        : { TELEGRAPH_ENGINE_URL: inputs.telegraphEngineUrl }),
      ...(inputs.expectedNetwork === undefined
        ? {}
        : { TELEGRAPH_EXPECTED_NETWORK: inputs.expectedNetwork }),
    };
    return createTelegraphClient(loadTelegraphConfig(environment));
  };
}

export async function runAction(): Promise<void> {
  try {
    const inputs = readActionInputs();
    const actionContext = parsePullRequestContext({
      eventName: githubContext.eventName,
      payload: githubContext.payload,
      owner: githubContext.repo.owner,
      repo: githubContext.repo.repo,
      actor: githubContext.actor,
      githubRunId: githubContext.runId,
      githubRunAttempt: githubContext.runAttempt,
    });
    const githubClient = createGitHubClient(
      loadGitHubConfig({
        ...process.env,
        GITHUB_TOKEN: inputs.githubToken,
      }),
    );
    const policy = await loadBaseCommitPolicy(githubClient, actionContext);
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: inputs.maxLookups,
      dependencies: {
        githubClient,
        telegraphClientFactory: createTelegraphFactory(inputs),
      },
    });

    const outputResult = await persistActionLedger(result, inputs, actionsCore);

    setActionOutputs(outputResult);
    await actionsCore.summary.addRaw(renderSummary(outputResult)).write();
    applyActionOutcome(outputResult);
  } catch (error) {
    const message = formatActionError(error);
    if (isLimenError(error)) {
      actionsCore.error(message);
    }
    actionsCore.setFailed(message);
  }
}
