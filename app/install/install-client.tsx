"use client";

import type { Session } from "@supabase/supabase-js";
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RepositoryCard } from "../components/repository-card";
import {
  createLimenApi,
  getInstallationId,
  limenApiErrorMessage,
  LimenApiError,
  type LimenApi,
  type LimenRepository,
} from "../lib/limen-api";
import { createClient } from "../lib/supabase/browser";

type InstallState = "loading" | "signed_out" | "ready" | "binding" | "pending" | "bound" | "error";

interface InstallClientProps {
  apiBaseUrl: string;
  installUrl: string | null;
  configurationError: string | null;
}

export async function bindInstallationAndLoadRepositories(
  installationIdValue: string,
  accessToken: string,
  api: Pick<LimenApi, "bindInstallation" | "listRepositories">,
): Promise<LimenRepository[]> {
  const installationId = getInstallationId(installationIdValue);
  if (installationId === null) {
    throw new LimenApiError(400, "GITHUB_INSTALLATION_ID_INVALID", "The GitHub installation ID is invalid.");
  }
  await api.bindInstallation(installationId, accessToken);
  return api.listRepositories(accessToken);
}

function removeInstallationId(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("installation_id");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function safeAuthError(): string {
  return "Limen could not verify your GitHub session. Try again.";
}

export function InstallClient({ apiBaseUrl, installUrl, configurationError }: InstallClientProps) {
  const [authState, setAuthState] = useState<InstallState>("loading");
  const [installState, setInstallState] = useState<InstallState>("ready");
  const [session, setSession] = useState<Session | null>(null);
  const [repositories, setRepositories] = useState<LimenRepository[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const handledInstallationId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError !== null) {
          setAuthState("error");
          setError(safeAuthError());
          return;
        }
        setSession(data.session);
        setAuthState(data.session === null ? "signed_out" : "ready");
        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(nextSession);
          setAuthState(nextSession === null ? "signed_out" : "ready");
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      } catch {
        if (!active) return;
        setAuthState("error");
        setError(safeAuthError());
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (authState !== "ready" || session === null) return;
    const installationIdValue = new URL(window.location.href).searchParams.get("installation_id");
    if (installationIdValue === null || handledInstallationId.current === installationIdValue) return;
    handledInstallationId.current = installationIdValue;
    const installationId = getInstallationId(installationIdValue);
    if (installationId === null) {
      removeInstallationId();
      queueMicrotask(() => {
        if (!active) return;
        setInstallState("error");
        setError("The GitHub installation ID is invalid. Start the installation again.");
      });
      return;
    }

    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setInstallState("binding");
      setError(null);
      try {
        const api = createLimenApi(apiBaseUrl);
        const nextRepositories = await bindInstallationAndLoadRepositories(
          installationIdValue,
          session.access_token,
          api,
        );
        removeInstallationId();
        setRepositories(nextRepositories);
        setInstallState("bound");
      } catch (caught) {
        if (caught instanceof Error && "code" in caught && caught.code === "INSTALLATION_NOT_CONFIRMED") {
          setInstallState("pending");
          return;
        }
        setInstallState("error");
        setError(limenApiErrorMessage(caught));
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, authState, session]);

  async function continueWithGitHub(): Promise<void> {
    setSigningIn(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError !== null) {
        setError("GitHub sign-in could not be started. Try again.");
        setSigningIn(false);
      }
    } catch {
      setError("GitHub sign-in could not be started. Try again.");
      setSigningIn(false);
    }
  }

  if (authState === "loading") {
    return <p className="setup-system-note" role="status" aria-live="polite">Checking your Limen session...</p>;
  }

  if (authState === "error") {
    return (
      <section className="setup-system-note" role="alert">
        <strong>Session unavailable</strong>
        <span>{error ?? safeAuthError()}</span>
      </section>
    );
  }

  if (authState === "signed_out") {
    return (
      <section className="setup-step-content" aria-labelledby="install-sign-in-heading">
        <p className="section-kicker">Step 01 / Account</p>
        <h2 id="install-sign-in-heading">Continue with GitHub</h2>
        <p>Use your GitHub identity to return to Limen and manage only installations you are authorized to use.</p>
        <div className="state-actions">
          <button className="button button-primary" type="button" onClick={continueWithGitHub} disabled={signingIn}>
            {signingIn ? "Opening GitHub..." : "Continue with GitHub"}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        {error ? <p className="lookup-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  if (installState === "binding") {
    return <p className="setup-system-note" role="status" aria-live="polite">Confirming your GitHub installation...</p>;
  }

  if (installState === "pending") {
    return (
      <section className="setup-system-note" role="status" aria-live="polite">
        <strong>Confirming your GitHub installation...</strong>
        <span>GitHub has returned the installation, but Limen is waiting for its verified webhook. The installation ID alone is not authorization.</span>
        <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Check again</button>
      </section>
    );
  }

  if (installState === "error") {
    return (
      <section className="setup-system-note" role="alert">
        <strong>Installation not connected</strong>
        <span>{error ?? "Limen could not connect this GitHub installation."}</span>
        <div className="state-actions">
          <Link className="button button-secondary" href="/install">Start again <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  if (installState === "bound") {
    return (
      <section className="setup-step-content" aria-labelledby="connected-repositories-heading">
        <p className="section-kicker">Installation connected</p>
        <h2 id="connected-repositories-heading">Authorized repositories</h2>
        <p>These repositories were returned by Limen after the authenticated installation binding succeeded.</p>
        {repositories.length > 0 ? (
          <div className="role-grid" aria-label="Authorized GitHub repositories">
            {repositories.map((repository) => <RepositoryCard key={repository.repositoryId} repository={repository} />)}
          </div>
        ) : (
          <div className="empty-evidence">
            <h2>No repositories available</h2>
            <p>Choose repositories in the GitHub App installation, then return here to connect them.</p>
          </div>
        )}
        <div className="state-actions">
          <Link className="button button-secondary" href="/repositories">Open repository workspace <ExternalLink aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="setup-step-content" aria-labelledby="install-app-heading">
      <p className="section-kicker">Step 02 / Installation</p>
      <h2 id="install-app-heading">Install Limen GitHub App</h2>
      <p>Choose the personal account or organization and repositories where Limen should propose its release-evidence workflow.</p>
      {configurationError ? (
        <div className="setup-system-note" role="alert">
          <strong>Installation unavailable</strong>
          <span>{configurationError}</span>
        </div>
      ) : (
        <div className="state-actions">
          <a className="button button-primary" href={installUrl ?? "#"} aria-disabled={installUrl === null}>
            Install Limen GitHub App
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      )}
      <div className="setup-explanation-grid">
        <div>
          <p className="setup-label">Requested access</p>
          <p>Repository metadata read, contents read/write, pull requests read/write, and workflows read/write only for the setup workflow file.</p>
        </div>
        <div>
          <p className="setup-label">Secret boundary</p>
          <p>Add <code>LIMEN_TELEGRAPH_PRIVATE_KEY</code> directly to GitHub repository Secrets. Never paste the private key into Limen.</p>
        </div>
      </div>
      {error ? <p className="lookup-error" role="alert">{error}</p> : null}
    </section>
  );
}
