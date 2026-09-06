import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function publicSupabaseCredentials(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url === undefined || url === "" || publishableKey === undefined || publishableKey === "") {
    throw new Error("Public Supabase configuration is missing.");
  }
  return { url, publishableKey };
}

export async function createClient() {
  const { url, publishableKey } = publicSupabaseCredentials();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies; route handlers can.
        }
      },
    },
  });
}
