import { createLedgerServer } from "./server";
import { loadLedgerApiConfig } from "./config";
import { SupabaseEvidenceLedger } from "./repository";
import { createServerSupabaseClient } from "./supabase";

const config = loadLedgerApiConfig();
const ledger = new SupabaseEvidenceLedger(createServerSupabaseClient(config));
const server = createLedgerServer({
  ledger,
  ingestToken: config.ingestToken,
});

server.listen(config.port, config.host, () => {
  console.log(`Limen ledger API listening on ${config.host}:${config.port}`);
});
