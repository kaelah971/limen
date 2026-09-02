import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LedgerApiConfig } from "./config";

/** Server-only: this client must never be imported by the Action or browser code. */
export function createServerSupabaseClient(
  config: Pick<LedgerApiConfig, "supabaseUrl" | "supabaseServiceRoleKey">,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
