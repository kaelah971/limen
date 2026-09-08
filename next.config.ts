import type { NextConfig } from "next";

function getConfiguredOrigin(value: string | undefined): string {
  const configuredUrl = value?.trim();
  if (configuredUrl === undefined || configuredUrl === "") {
    return "";
  }
  try {
    const url = new URL(configuredUrl);
    const isLocalDevelopmentHttp = process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    return url.protocol === "https:" || isLocalDevelopmentHttp ? url.origin : "";
  } catch {
    return "";
  }
}

const supabaseOrigin = getConfiguredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const limenApiOrigin = getConfiguredOrigin(process.env.LIMEN_PUBLIC_API_URL);
const connectSources = ["'self'", supabaseOrigin, limenApiOrigin]
  .filter((origin) => origin !== "")
  .join(" ");

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
              `connect-src ${connectSources}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
