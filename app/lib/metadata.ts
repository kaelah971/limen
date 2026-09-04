import type { Metadata } from "next";

export const LIMEN_SITE_TITLE = "Limen | Release evidence gate";
export const LIMEN_SITE_DESCRIPTION =
  "Limen turns repository facts and routed CVE evidence into a policy-backed release decision.";

function getMetadataBase(): URL | undefined {
  const configuredUrl = process.env.LIMEN_SITE_URL?.trim();
  if (!configuredUrl) return undefined;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export const siteMetadata: Metadata = {
  ...(getMetadataBase() ? { metadataBase: getMetadataBase() } : {}),
  title: {
    default: LIMEN_SITE_TITLE,
    template: "%s | Limen",
  },
  description: LIMEN_SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Limen",
    title: LIMEN_SITE_TITLE,
    description: LIMEN_SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: LIMEN_SITE_TITLE,
    description: LIMEN_SITE_DESCRIPTION,
  },
  icons: {
    icon: "/limen-logo.svg",
    apple: "/limen-logo.svg",
  },
};

export function getPageMetadata(
  title: string,
  description: string,
  canonical: string,
): Metadata {
  const socialTitle = `${title} | Limen`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "Limen",
      title: socialTitle,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: socialTitle,
      description,
    },
  };
}
