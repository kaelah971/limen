import type { NextConfig } from "next";

function getSupabaseOrigin(value: string | undefined): string {
  const configuredUrl = value?.trim();
  if (configuredUrl === undefined || configuredUrl === "") {
    return "";
  }
  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

const supabaseOrigin = getSupabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              `connect-src 'self' ${supabaseOrigin}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
