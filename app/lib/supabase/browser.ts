import { createBrowserClient } from "@supabase/ssr";

function publicSupabaseCredentials(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url === undefined || url === "" || publishableKey === undefined || publishableKey === "") {
    throw new Error("Public Supabase configuration is missing.");
  }
  return { url, publishableKey };
}

export function createClient() {
  const { url, publishableKey } = publicSupabaseCredentials();
  return createBrowserClient(url, publishableKey);
}
