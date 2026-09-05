import { z } from "zod";
import { LOCAL_HOSTS, parseOutboundUrl } from "../../../packages/core/src";

export interface LedgerApiConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  ingestToken: string;
  host: string;
  port: number;
}

const EnvironmentSchema = z.object({
  SUPABASE_URL: z.string().refine(isAllowedSupabaseUrl, {
    message: "SUPABASE_URL must use HTTPS except for explicit localhost development URLs.",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  LIMEN_INGEST_TOKEN: z.string().trim().min(1),
  LIMEN_API_HOST: z.string().trim().min(1).max(255)
    .regex(/^[^\u0000-\u001F\u007F-\u009F]+$/)
    .default("127.0.0.1"),
  LIMEN_API_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
});

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    parseOutboundUrl(value, {
      name: "Supabase",
      allowHttpHosts: LOCAL_HOSTS,
    });
    return true;
  } catch {
    return false;
  }
}

export function loadLedgerApiConfig(
  environment: Record<string, string | undefined> = process.env,
): LedgerApiConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error("Ledger API configuration is invalid.");
  }

  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    ingestToken: parsed.data.LIMEN_INGEST_TOKEN,
    host: parsed.data.LIMEN_API_HOST,
    port: parsed.data.LIMEN_API_PORT,
  };
}
