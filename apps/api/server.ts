import { createServerSupabaseClient } from "./src/supabase";
import { loadLedgerApiConfig } from "./src/config";
import { createLedgerServer } from "./src/server";
import { SupabaseEvidenceLedger } from "./src/repository";
import { SupabaseEvidenceReceiptStore } from "./src/receipt-repository";

const config = loadLedgerApiConfig();
const client = createServerSupabaseClient(config);
const server = createLedgerServer({
  ledger: new SupabaseEvidenceLedger(client),
  receipts: new SupabaseEvidenceReceiptStore(client),
  ingestToken: config.ingestToken,
});

server.listen(Number(process.env.PORT ?? config.port), config.host, () => {
  console.log(`Limen ledger API listening on ${config.host}:${process.env.PORT ?? config.port}`);
});
