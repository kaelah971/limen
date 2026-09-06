"use client";

import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DecisionBadge } from "../../components/decision-badge";
import { RepositoryStatus } from "../../components/repository-status";
import {
  createLimenApi,
  limenApiErrorMessage,
  LimenApiError,
  type LimenRepository,
  type LimenSetupFilePreview,
  type LimenSetupPreview,
} from "../../lib/limen-api";
import { createClient } from "../../lib/supabase/browser";
import { formatTimestamp } from "../../lib/receipt-view";
import { SetupCodeBlock } from "../../components/setup-code-block";

interface RepositoryClientProps {
  apiBaseUrl: string;
  repositoryId: number;
}

type LoadState = "loading" | "ready" | "not_found" | "error";
type MutationState = "idle" | "loading" | "success" | "error";

function decisionHeading(decision: LimenRepository["latestDecision"]): string {
  switch (decision) {
    case "PASS":
      return "Held threshold cleared";
    case "HOLD":
      return "Release held";
    case "REVIEW":
      return "Needs evidence review";
    default:
      return "No release decision yet";
  }
}

function isSetupState(repository: LimenRepository): boolean {
  return repository.lifecycleState === "SETUP_REQUIRED"
    || repository.lifecycleState === "SETUP_PR_OPEN"
    || repository.lifecycleState === "NEEDS_ATTENTION";
}

function fileForPath(preview: LimenSetupPreview, path: LimenSetupFilePreview["path"]): LimenSetupFilePreview | null {
  return preview.files.find((file) => file.path === path) ?? null;
}

function SetupPreviewPanel({ preview }: { preview: LimenSetupPreview }) {
  const policy = fileForPath(preview, "limen.yml");
  const alternatePolicy = fileForPath(preview, "limen.yaml");
  const workflow = fileForPath(preview, ".github/workflows/limen.yml");
  const filesToCreate = preview.filesToCreate;

  return (
    <section className="setup-step-content" aria-labelledby="setup-preview-heading">
      <p className="section-kicker">Setup preview</p>
      <h2 id="setup-preview-heading">Review proposed setup.</h2>
      <p>Limen proposes only missing files. Existing policy and workflow files are preserved and are never overwritten.</p>
      <div className="setup-config-grid">
        <div className="setup-config-card">
          <p className="setup-label">Policy</p>
          <p><strong>{policy?.status === "existing" || alternatePolicy?.status === "existing" ? "Policy present" : "Policy missing"}</strong></p>
          <p>{alternatePolicy?.status === "existing" ? <><code>limen.yaml</code> already exists and counts as the repository policy.</> : <>The canonical file is <code>limen.yml</code>.</>}</p>
          {policy?.status === "missing" && policy.content !== undefined ? (
            <SetupCodeBlock value={policy.content} filename="limen.yml" label="proposed Limen policy" />
          ) : null}
        </div>
        <div className="setup-config-card">
          <p className="setup-label">Workflow</p>
          <p><strong>{workflow?.status === "existing" ? "Workflow present" : "Workflow missing"}</strong></p>
          <p>The workflow path is <code>.github/workflows/limen.yml</code>.</p>
          {workflow?.status === "missing" && workflow.content !== undefined ? (
            <SetupCodeBlock value={workflow.content} filename=".github/workflows/limen.yml" label="proposed Limen workflow" />
          ) : null}
        </div>
      </div>
      <div className="setup-validation">
        <p className="setup-label">Files Limen will create</p>
        {filesToCreate.length > 0 ? (
          <ul>
            {filesToCreate.map((path) => <li key={path}><code>{path}</code></li>)}
          </ul>
        ) : (
          <p>No files are proposed. The existing setup files will be preserved.</p>
        )}
      </div>
      <div className="setup-note">
        <strong>Secret boundary</strong>
        <span>Add <code>LIMEN_TELEGRAPH_PRIVATE_KEY</code> directly to GitHub repository Secrets and configure <code>TELEGRAPH_ENGINE_URL</code> as a GitHub repository Variable. Never paste the private key into Limen.</span>
      </div>
    </section>
  );
}

function RepositoryNotFound() {
  return (
    <section className="system-state not-found-state" role="alert">
      <p className="eyebrow">Repository lookup</p>
      <h1>REPOSITORY NOT FOUND</h1>
      <p>This repository is not available through your authorized Limen GitHub App installations.</p>
      <div className="state-actions">
          <Link className="button button-secondary" href="/repositories">Back to repositories <ArrowLeft aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function RepositoryError({ message }: { message: string }) {
  return (
    <section className="system-state" role="alert">
      <p className="eyebrow">Repository unavailable</p>
      <h1>Repository control is unavailable.</h1>
      <p>{message}</p>
      <div className="state-actions">
        <Link className="button button-secondary" href="/repositories">Back to repositories <ArrowLeft aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

export function RepositoryClient({ apiBaseUrl, repositoryId }: RepositoryClientProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [repository, setRepository] = useState<LimenRepository | null>(null);
  const [preview, setPreview] = useState<LimenSetupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mutationState, setMutationState] = useState<MutationState>("idle");
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError !== null || data.session === null) {
          if (active) {
            setLoadState("error");
            setMutationMessage("Your Limen session has expired. Sign in again.");
          }
          return;
        }

        const api = createLimenApi(apiBaseUrl);
        const nextRepository = await api.getRepository(repositoryId, data.session.access_token);
        if (!active) return;
        setRepository(nextRepository);
        setLoadState("ready");

        if (isSetupState(nextRepository)) {
          try {
            setPreview(await api.getSetupPreview(repositoryId, data.session.access_token));
          } catch (error) {
            if (active) setPreviewError(limenApiErrorMessage(error));
          }
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof LimenApiError && error.status === 404) {
          setLoadState("not_found");
        } else {
          setLoadState("error");
          setMutationMessage(limenApiErrorMessage(error));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, repositoryId]);

  async function createSetupPr(): Promise<void> {
    if (repository === null || mutationState === "loading") return;
    const sessionResult = await createClient().auth.getSession();
    const session = sessionResult.data.session;
    if (sessionResult.error !== null || session === null) {
      setMutationState("error");
      setMutationMessage("Your Limen session has expired. Sign in again.");
      return;
    }

    setMutationState("loading");
    setMutationMessage(null);
    try {
      const result = await createLimenApi(apiBaseUrl).createSetupPullRequest(
        repository.repositoryId,
        session.access_token,
      );
      setRepository({
        ...repository,
        lifecycleState: "SETUP_PR_OPEN",
        setupPullRequest: result.setupPullRequest,
      });
      setMutationState("success");
      setMutationMessage(result.code === "OPEN_SETUP_PR_EXISTS" ? "Setup PR is already open." : "Setup PR created.");
    } catch (error) {
      setMutationState("error");
      setMutationMessage(limenApiErrorMessage(error));
    }
  }

  if (loadState === "loading") {
    return <p className="setup-system-note" role="status" aria-live="polite" aria-busy="true">Loading repository control...</p>;
  }
  if (loadState === "not_found") return <RepositoryNotFound />;
  if (loadState === "error") return <RepositoryError message={mutationMessage ?? "Limen could not load this repository."} />;
  if (repository === null) return <RepositoryError message="Limen returned no repository data." />;

  const setupActionAvailable = preview !== null
    && preview.filesToCreate.length > 0
    && (repository.lifecycleState === "SETUP_REQUIRED" || repository.lifecycleState === "NEEDS_ATTENTION")
    && repository.setupPullRequest === null;

  return (
    <>
      <header className="receipt-heading">
        <div>
          <p className="eyebrow">Repository control</p>
          <h1>{repository.fullName}</h1>
          <p className="setup-hero-support">Default branch: <code>{repository.defaultBranch}</code></p>
        </div>
        <RepositoryStatus state={repository.lifecycleState} />
      </header>

      <section className="decision-surface" aria-labelledby="repository-decision-heading">
        <div className="decision-surface-grid">
          <div>
            <p className="source-label">Latest release decision</p>
            {repository.latestDecision === null ? <span className="context-tag">No release decision yet</span> : <DecisionBadge decision={repository.latestDecision} />}
            <h2 id="repository-decision-heading">{decisionHeading(repository.latestDecision)}</h2>
            <p className="decision-summary">Integration state and release decision are separate. The repository becomes verified only after an accepted real evaluation.</p>
            <div className="decision-meta">
              <div className="decision-meta-row"><span>Integration state</span><span>{repository.lifecycleState}</span></div>
              <div className="decision-meta-row"><span>Last evaluation</span><span>{formatTimestamp(repository.latestEvaluationAt)}</span></div>
            </div>
          </div>
          <div className="setup-note">
            <strong>Next action</strong>
            <span>{repository.lifecycleState === "SETUP_REQUIRED" ? "Review the proposed setup before creating a PR." : repository.lifecycleState === "SETUP_PR_OPEN" ? "Review and merge the open setup PR, then run a real evaluation." : repository.lifecycleState === "CONFIGURED" ? "Run a real Limen evaluation to verify the repository." : repository.lifecycleState === "VERIFIED" ? "View the latest decision and continue under the recorded integration." : repository.lifecycleState === "NEEDS_ATTENTION" ? "Review the integration setup and create a corrective setup PR if appropriate." : "Reconnect Limen before taking repository actions."}</span>
          </div>
        </div>
      </section>

      {isSetupState(repository) ? (
        previewError ? <div className="setup-system-note" role="alert"><strong>Setup preview unavailable</strong><span>{previewError}</span></div> : preview === null ? <p className="setup-system-note" role="status" aria-live="polite">Loading setup preview...</p> : <SetupPreviewPanel preview={preview} />
      ) : null}

      <section className="setup-step-content" aria-labelledby="setup-action-heading">
        <p className="section-kicker">Setup action</p>
        <h2 id="setup-action-heading">Keep setup changes reviewable.</h2>
        <p>Limen never commits directly to the default branch and never marks a repository verified when a setup PR is created.</p>
        {repository.setupPullRequest !== null ? (
          <div className="state-actions">
            <a className="button button-primary" href={repository.setupPullRequest.url} target="_blank" rel="noreferrer noopener">
              View setup PR <ExternalLink aria-hidden="true" />
            </a>
          </div>
        ) : setupActionAvailable ? (
          <div className="state-actions">
            <button className="button button-primary" type="button" onClick={createSetupPr} disabled={mutationState === "loading"} aria-busy={mutationState === "loading"}>
              {mutationState === "loading" ? "Creating setup PR..." : "Create setup PR"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        ) : repository.lifecycleState === "SETUP_PR_OPEN" ? (
          <p className="setup-note" role="status">Setup PR open. Limen will show the repository as configured only after GitHub confirms the merge.</p>
        ) : repository.lifecycleState === "DISCONNECTED" ? (
          <p className="setup-note setup-note-warning">This repository is disconnected. No setup action is available.</p>
        ) : preview?.alreadyConfigured ? (
          <p className="setup-note" role="status">Setup files already exist. Review the existing configuration; Limen will not create a duplicate setup PR.</p>
        ) : (
          <p className="setup-note" role="status">A setup PR is not available until Limen can inspect the repository files.</p>
        )}
        {mutationMessage && mutationState !== "error" && mutationState !== "loading" ? <p className="setup-note" role="status" aria-live="polite">{mutationMessage}</p> : null}
        {mutationState === "error" && mutationMessage ? <p className="setup-system-note" role="alert"><strong>Setup PR not created</strong><span>{mutationMessage}</span></p> : null}
      </section>
    </>
  );
}
