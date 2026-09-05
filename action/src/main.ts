import * as actionsCore from "@actions/core";
import { context as githubContext } from "@actions/github";
import {
  createObservabilityLogger,
  isLimenError,
  redactString,
  serializeError,
  startObservabilityStage,
  type LimenCorrelationContext,
  type LimenObservabilityEvent,
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
import { createLimenRunId, orchestrateLimenRun } from "./orchestrate";
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
  const safeSummary = redactString(result.runSummary);
  if (result.overallDecision === "PASS") {
    runtime.notice("Limen: PASS");
    return;
  }
  if (result.overallDecision === "HOLD") {
    runtime.error(`Limen: HOLD. ${safeSummary}`);
    runtime.setFailed(`Limen: HOLD. ${safeSummary}`);
    return;
  }
  runtime.warning(`Limen: REVIEW. ${safeSummary}`);
  runtime.setFailed(`Limen: REVIEW. ${safeSummary}`);
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
  const limenRunId = createLimenRunId();
  const events: LimenObservabilityEvent[] = [];
  const observability = createObservabilityLogger(
    {
      info: actionsCore.info,
      warning: actionsCore.warning,
      error: actionsCore.error,
    },
    (event) => { events.push(event); },
  );
  let correlation: LimenCorrelationContext = { limenRunId };
  const workflowCorrelation: LimenCorrelationContext = { limenRunId };
  const workflowStage = startObservabilityStage(
    observability,
    "workflow-result",
    workflowCorrelation,
  );

  try {
    const validationStage = startObservabilityStage(
      observability,
      "event-validation",
      correlation,
    );
    let inputs: ActionInputs;
    let actionContext: ReturnType<typeof parsePullRequestContext>;
    try {
      inputs = readActionInputs();
      actionContext = parsePullRequestContext({
        eventName: githubContext.eventName,
        payload: githubContext.payload,
        owner: githubContext.repo.owner,
        repo: githubContext.repo.repo,
        actor: githubContext.actor,
        githubRunId: githubContext.runId,
        githubRunAttempt: githubContext.runAttempt,
      });
      correlation = {
        ...correlation,
        githubRunId: actionContext.githubRunId,
        githubRunAttempt: actionContext.githubRunAttempt,
        repository: actionContext.repository,
        pullRequestNumber: actionContext.pullRequestNumber,
        baseSha: actionContext.baseSha,
        headSha: actionContext.headSha,
      };
      Object.assign(workflowCorrelation, correlation);
      validationStage.success(correlation);
    } catch (error) {
      validationStage.failure(error);
      throw error;
    }

    const githubClient = createGitHubClient(
      loadGitHubConfig({
        ...process.env,
        GITHUB_TOKEN: inputs.githubToken,
      }),
    );
    const policy = await loadBaseCommitPolicy(githubClient, actionContext, {
      logger: observability,
      correlation,
      now: () => new Date(),
    });
    correlation = { ...correlation, policyVersion: policy.version };
    Object.assign(workflowCorrelation, correlation);
    const result = await orchestrateLimenRun({
      context: actionContext,
      policy,
      maxLookups: inputs.maxLookups,
      dependencies: {
        githubClient,
        telegraphClientFactory: createTelegraphFactory(inputs),
        createRunId: () => limenRunId,
        observability,
      },
    });

    const ledgerStage = startObservabilityStage(
      observability,
      "ledger-persistence",
      correlation,
    );
    const outputResult = await persistActionLedger(result, inputs, actionsCore);
    if (outputResult.ledgerStatus === "failed") {
      ledgerStage.failure(undefined, {
        errorCode: outputResult.ledgerErrorCode,
        httpStatus: outputResult.ledgerHttpStatus,
      });
    } else {
      ledgerStage.success({
        outcome: outputResult.ledgerStatus === "not-configured" || outputResult.ledgerStatus === "partial"
          ? "skipped"
          : "success",
        durationMs: outputResult.ledgerPersistenceDurationMs,
        ...(outputResult.ledgerStatus === "partial"
          ? { reasonCode: "LEDGER_PARTIAL_CONFIGURATION" }
          : {}),
      });
    }

    const summaryStage = startObservabilityStage(
      observability,
      "summary-output",
      correlation,
    );
    try {
      setActionOutputs(outputResult);
      await actionsCore.summary.addRaw(renderSummary(outputResult, events)).write();
      summaryStage.success();
    } catch (error) {
      summaryStage.failure(error);
      throw error;
    }
    applyActionOutcome(outputResult);
    const workflowFields = {
      outcome: outputResult.overallDecision.toLowerCase() as "pass" | "hold" | "review",
      reasonCode: outputResult.runReasonCode,
    };
    if (outputResult.overallDecision === "PASS") {
      workflowStage.success(workflowFields);
    } else {
      workflowStage.failure(undefined, workflowFields);
    }
  } catch (error) {
    workflowStage.failure(error);
    const message = formatActionError(error);
    if (isLimenError(error)) {
      actionsCore.error(message);
    }
    actionsCore.setFailed(message);
  }
}
