import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LimenFooter, LimenHeader, PageFrame } from "../components/brand";
import { RepositoryCard } from "../components/repository-card";
import { createLimenApi, limenApiErrorMessage, type LimenRepository } from "../lib/limen-api";
import { getPublicReceiptApiUrl } from "../lib/receipt-api";
import { createClient } from "../lib/supabase/server";
import { getPageMetadata } from "../lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = getPageMetadata(
  "Repositories",
  "Review connected repositories and their Limen integration state.",
  "/repositories",
);

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main setup-page">
        <div className="content-container">{children}</div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}

function WorkspaceError({ message }: { message: string }) {
  return (
    <section className="system-state" role="alert">
      <p className="eyebrow">Workspace unavailable</p>
      <h1>Repositories could not be loaded.</h1>
      <p>{message}</p>
      <div className="state-actions">
        <Link className="button button-secondary" href="/install">Return to GitHub connection <ArrowRight aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function SignedOutWorkspace() {
  return (
    <section className="setup-step-content" aria-labelledby="workspace-sign-in-heading">
      <p className="section-kicker">Workspace access</p>
      <h2 id="workspace-sign-in-heading">Continue with GitHub</h2>
      <p>Sign in before Limen requests any repository data. Your GitHub App installations remain the authority for repository access.</p>
      <div className="state-actions">
        <Link className="button button-primary" href="/install">Continue with GitHub <ArrowRight aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function RepositoryWorkspace({ repositories }: { repositories: LimenRepository[] }) {
  return (
    <>
      <header className="page-heading setup-hero">
        <p className="eyebrow">GitHub App workspace</p>
        <h1>Connected repositories.</h1>
        <p>Review Limen integration state and take one clear next action per repository.</p>
      </header>
      {repositories.length === 0 ? (
        <section className="empty-evidence" aria-labelledby="no-repositories-heading">
          <h2 id="no-repositories-heading">No authorized repositories yet.</h2>
          <p>Install Limen or choose repositories in the GitHub App installation to begin onboarding.</p>
          <div className="state-actions">
            <Link className="button button-primary" href="/install">Connect GitHub <ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>
      ) : (
        <div className="role-grid" aria-label="Connected GitHub repositories">
          {repositories.map((repository) => <RepositoryCard key={repository.repositoryId} repository={repository} />)}
        </div>
      )}
    </>
  );
}

export default async function RepositoriesPage() {
  let session = null;
  let sessionUnavailable = false;
  try {
    const supabase = await createClient();
    const result = await supabase.auth.getSession();
    if (result.error !== null) {
      sessionUnavailable = true;
    } else {
      session = result.data.session;
    }
  } catch {
    sessionUnavailable = true;
  }

  if (sessionUnavailable) return <WorkspaceShell><WorkspaceError message="Your Limen session could not be verified. Sign in again." /></WorkspaceShell>;
  if (session === null) {
    return <WorkspaceShell><SignedOutWorkspace /></WorkspaceShell>;
  }

  let repositories: LimenRepository[] | null = null;
  let repositoryError: string | null = null;
  try {
    repositories = await createLimenApi(getPublicReceiptApiUrl()).listRepositories(session.access_token);
  } catch (error) {
    repositoryError = limenApiErrorMessage(error);
  }
  if (repositoryError !== null) return <WorkspaceShell><WorkspaceError message={repositoryError} /></WorkspaceShell>;
  return <WorkspaceShell><RepositoryWorkspace repositories={repositories ?? []} /></WorkspaceShell>;
}
