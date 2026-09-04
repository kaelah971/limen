import { IBM_Plex_Mono, Pixelify_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { siteMetadata } from "@/app/lib/metadata";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const pixelifySans = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata = siteMetadata;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${pixelifySans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
