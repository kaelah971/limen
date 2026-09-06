import * as actionsCore from "@actions/core";
import { ConfigurationError } from "../../packages/core/src";
import { LedgerUsageClassSchema } from "../../packages/ledger/src";
import type { LedgerUsageClass } from "../../packages/ledger/src";
import type { ActionInputs } from "./types";

export type ParsedActionInputs = ActionInputs & { limenApiUrl?: string };

export interface ActionInputReader {
  getInput(
    name: string,
    options?: { required?: boolean; trimWhitespace?: boolean },
  ): string;
  setSecret(value: string): void;
}

export function parseMaxLookups(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new ConfigurationError("max-lookups must be an integer from 1 to 20.", {
      field: "max-lookups",
    });
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new ConfigurationError("max-lookups must be an integer from 1 to 20.", {
      field: "max-lookups",
    });
  }
  return parsed;
}

export function parseUsageClass(value: string): LedgerUsageClass {
  const parsed = LedgerUsageClassSchema.safeParse(value.trim() || "production");
  if (!parsed.success) {
    throw new ConfigurationError(
      "usage-class must be production, demo, development, or test.",
      { field: "usage-class" },
    );
  }
  return parsed.data;
}

export function parseLimenApiUrl(value: string): string | undefined {
  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ConfigurationError("limen-api-url must be a valid HTTPS URL.", {
      field: "limen-api-url",
    });
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new ConfigurationError("limen-api-url must be a valid HTTPS URL.", {
      field: "limen-api-url",
    });
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

export function readActionInputs(
  reader: ActionInputReader = actionsCore,
  environment: Record<string, string | undefined> = process.env,
): ParsedActionInputs {
  const githubToken = reader.getInput("github-token", { required: true }).trim();
  if (githubToken === "") {
    throw new ConfigurationError("github-token is required.", {
      field: "github-token",
    });
  }
  reader.setSecret(githubToken);

  const inputPrivateKey = reader.getInput("telegraph-private-key").trim();
  const environmentPrivateKey = environment.TELEGRAPH_PRIVATE_KEY?.trim();
  const telegraphPrivateKey = inputPrivateKey || environmentPrivateKey || undefined;
  if (telegraphPrivateKey !== undefined) {
    reader.setSecret(telegraphPrivateKey);
  }

  const inputEngineUrl = reader.getInput("telegraph-engine-url").trim();
  const inputNetwork = reader.getInput("expected-network").trim();
  const inputLimenApiUrl = parseLimenApiUrl(reader.getInput("limen-api-url"));
  const inputLedgerUrl = reader.getInput("ledger-url").trim();
  const inputLedgerToken = reader.getInput("ledger-token").trim();
  const inputUsageClass = reader.getInput("usage-class").trim();
  const environmentEngineUrl = environment.TELEGRAPH_ENGINE_URL?.trim();
  const environmentNetwork = environment.TELEGRAPH_EXPECTED_NETWORK?.trim();
  const environmentLedgerUrl = environment.LIMEN_LEDGER_URL?.trim();
  const environmentLedgerToken = environment.LIMEN_LEDGER_TOKEN?.trim();
  const environmentUsageClass = environment.LIMEN_USAGE_CLASS?.trim();
  const ledgerToken = inputLedgerToken || environmentLedgerToken || undefined;
  if (ledgerToken !== undefined) {
    reader.setSecret(ledgerToken);
  }

  return {
    githubToken,
    ...(telegraphPrivateKey === undefined ? {} : { telegraphPrivateKey }),
    ...(inputEngineUrl || environmentEngineUrl
      ? { telegraphEngineUrl: inputEngineUrl || environmentEngineUrl }
      : {}),
    ...(inputNetwork || environmentNetwork
      ? { expectedNetwork: inputNetwork || environmentNetwork }
      : {}),
    ...(inputLimenApiUrl === undefined ? {} : { limenApiUrl: inputLimenApiUrl }),
    maxLookups: parseMaxLookups(reader.getInput("max-lookups") || "5"),
    ...(inputLedgerUrl || environmentLedgerUrl
      ? { ledgerUrl: inputLedgerUrl || environmentLedgerUrl }
      : {}),
    ...(ledgerToken === undefined ? {} : { ledgerToken }),
    usageClass: parseUsageClass(inputUsageClass || environmentUsageClass || "production"),
  };
}
