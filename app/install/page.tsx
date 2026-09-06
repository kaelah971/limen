import { LimenFooter, LimenHeader, PageFrame } from "../components/brand";
import { getPublicReceiptApiUrl } from "../lib/receipt-api";
import { getPageMetadata } from "../lib/metadata";
import { InstallClient } from "./install-client";
import { getGitHubAppInstallUrl } from "./install-config";

export const dynamic = "force-dynamic";

export const metadata = getPageMetadata(
  "Connect GitHub",
  "Sign in with GitHub and connect repositories to the Limen release evidence gate.",
  "/install",
);

export default function InstallPage() {
  let installUrl: string | null = null;
  let configurationError: string | null = null;
  try {
    installUrl = getGitHubAppInstallUrl();
  } catch {
    configurationError = "The GitHub App installation is not configured.";
  }

  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main setup-page">
        <div className="content-container">
          <header className="page-heading setup-hero">
            <p className="eyebrow">GitHub App onboarding</p>
            <h1>Connect your repositories.</h1>
            <p>Sign in with GitHub, install Limen for the repositories you choose, and review setup changes through a pull request.</p>
            <p className="setup-hero-support">Limen keeps repository authorization with GitHub and the backend. The browser never receives GitHub App credentials or Telegraph secrets.</p>
          </header>
          <InstallClient
            apiBaseUrl={getPublicReceiptApiUrl()}
            installUrl={installUrl}
            configurationError={configurationError}
          />
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
