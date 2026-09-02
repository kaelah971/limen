import type {
  EvidenceLedger,
  LedgerRunIngest,
  PersistedRun,
} from "./types";
import { validateLedgerRunIngest } from "./validation";

/**
 * Explicitly permits importing an already-sanitized historical record without
 * making historical traffic look like production usage.
 */
export async function backfillSanitizedRun(
  ledger: Pick<EvidenceLedger, "persistRun">,
  input: LedgerRunIngest,
): Promise<PersistedRun> {
  const validated = validateLedgerRunIngest(input);
  if (validated.run.source !== "backfill" || validated.run.usageClass !== "demo") {
    throw new Error("Historical ledger backfills must use source=backfill and usageClass=demo.");
  }
  return ledger.persistRun(validated);
}
