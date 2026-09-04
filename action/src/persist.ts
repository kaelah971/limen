import { LedgerIngestClient } from "../../packages/ledger/src";
import { performance } from "node:perf_hooks";
import type { ActionInputs, LimenRunResult } from "./types";
import { buildLedgerRunIngest } from "./ledger";

export interface ActionLedgerRuntime {
  warning(message: string): void;
}

export type LedgerClientFactory = (
  url: string,
  token: string,
) => Pick<LedgerIngestClient, "persistRun">;

export async function persistActionLedger(
  result: LimenRunResult,
  inputs: Pick<ActionInputs, "ledgerUrl" | "ledgerToken" | "usageClass">,
  runtime: ActionLedgerRuntime,
  clientFactory: LedgerClientFactory = (url, token) => new LedgerIngestClient({
    url,
    token,
  }),
): Promise<LimenRunResult> {
  let outputResult: LimenRunResult = {
    ...result,
    ledgerPersisted: false,
    ledgerStatus: "not-configured",
  };
  const ledgerUrl = inputs.ledgerUrl;
  const ledgerToken = inputs.ledgerToken;
  if (ledgerUrl !== undefined && ledgerToken !== undefined) {
    const ingest = buildLedgerRunIngest(result, inputs.usageClass);
    if (ingest === null) {
      runtime.warning(
        "Evidence ledger: persistence skipped because GitHub run identity was unavailable.",
      );
    } else {
      const started = performance.now();
      try {
        const persisted = await clientFactory(ledgerUrl, ledgerToken).persistRun(ingest);
        outputResult = {
          ...outputResult,
          ledgerRunId: persisted.id,
          ledgerPersisted: true,
          ledgerStatus: "recorded",
          ledgerPersistenceDurationMs: Math.max(0, Math.round(performance.now() - started)),
        };
      } catch (error) {
        const errorRecord = error !== null && typeof error === "object"
          ? error as Record<string, unknown>
          : undefined;
        const errorCode = typeof errorRecord?.responseCode === "string"
          ? errorRecord.responseCode
          : typeof errorRecord?.code === "string"
            ? errorRecord.code
            : "LEDGER_CLIENT_ERROR";
        const httpStatus = typeof errorRecord?.status === "number"
          ? errorRecord.status
          : undefined;
        runtime.warning(
          "Evidence ledger: persistence failed; the Limen release decision remains authoritative.",
        );
        outputResult = {
          ...outputResult,
          ledgerStatus: "failed",
          ledgerPersistenceDurationMs: Math.max(0, Math.round(performance.now() - started)),
          ledgerErrorCode: /^[A-Z][A-Z0-9_]{1,127}$/.test(errorCode)
            ? errorCode
            : "LEDGER_CLIENT_ERROR",
          ...(httpStatus === undefined ? {} : { ledgerHttpStatus: httpStatus }),
        };
      }
    }
  } else if (ledgerUrl !== undefined || ledgerToken !== undefined) {
    runtime.warning(
      "Evidence ledger: provide both ledger-url and ledger-token to enable persistence; release decision was unaffected.",
    );
    outputResult = { ...outputResult, ledgerStatus: "partial" };
  }

  return outputResult;
}
