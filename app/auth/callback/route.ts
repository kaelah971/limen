import { NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

function installRedirect(request: Request, failed = false): NextResponse {
  const url = new URL("/install", request.url);
  if (failed) {
    url.searchParams.set("auth", "failed");
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const code = new URL(request.url).searchParams.get("code");
  if (code === null || code.trim() === "") {
    return installRedirect(request, true);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) {
      return installRedirect(request, true);
    }
  } catch {
    return installRedirect(request, true);
  }

  return installRedirect(request);
}
