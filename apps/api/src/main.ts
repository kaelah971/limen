import { createLedgerServer } from "./server";
import { loadLedgerApiConfig } from "./config";
import { SupabaseEvidenceLedger } from "./repository";
import { SupabaseEvidenceReceiptStore } from "./receipt-repository";
import { createServerSupabaseClient } from "./supabase";

const config = loadLedgerApiConfig();
const client = createServerSupabaseClient(config);
const ledger = new SupabaseEvidenceLedger(client);
const receipts = new SupabaseEvidenceReceiptStore(client);
const server = createLedgerServer({
  ledger,
  receipts,
  ingestToken: config.ingestToken,
});

server.listen(config.port, config.host, () => {
  console.log(`Limen ledger API listening on ${config.host}:${config.port}`);
});
