import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { DecisionBadge } from "./decision-badge";
import { RepositoryStatus } from "./repository-status";
import type { LimenRepository } from "../lib/limen-api";
import { formatTimestamp } from "../lib/receipt-view";

function detailHref(repository: LimenRepository): string {
  return `/repositories/${repository.repositoryId}`;
}

function RepositoryAction({ repository }: { repository: LimenRepository }) {
  const href = detailHref(repository);
  if (repository.lifecycleState === "DISCONNECTED") {
    return <span className="setup-note setup-note-warning">Repository unavailable; reconnect Limen before taking setup actions.</span>;
  }

  if (repository.lifecycleState === "SETUP_PR_OPEN" && repository.setupPullRequest !== null) {
    return (
      <a className="button button-secondary" href={repository.setupPullRequest.url} target="_blank" rel="noreferrer noopener">
        View setup PR <ExternalLink aria-hidden="true" />
      </a>
    );
  }

  if (repository.lifecycleState === "SETUP_REQUIRED") {
    return <Link className="button button-primary" href={href}>Configure Limen <ArrowRight aria-hidden="true" /></Link>;
  }
  if (repository.lifecycleState === "NEEDS_ATTENTION") {
    return <Link className="button button-primary" href={href}>Fix setup <ArrowRight aria-hidden="true" /></Link>;
  }
  return <Link className="button button-secondary" href={href}>View repository <ArrowRight aria-hidden="true" /></Link>;
}

export function RepositoryCard({ repository }: { repository: LimenRepository }) {
  return (
    <article className="role-card">
      <div className="proof-card-header">
        <div>
          <p className="source-label">GitHub repository</p>
          <h3><Link href={detailHref(repository)}>{repository.fullName}</Link></h3>
        </div>
        <RepositoryStatus state={repository.lifecycleState} />
      </div>
      <div className="decision-meta">
        <div className="decision-meta-row">
          <span>Lifecycle</span>
          <span>{repository.lifecycleState}</span>
        </div>
        <div className="decision-meta-row">
          <span>Latest release decision</span>
          <span>
            {repository.latestDecision === null
              ? "No release decision yet"
              : <DecisionBadge decision={repository.latestDecision} />}
          </span>
        </div>
        <div className="decision-meta-row">
          <span>Last evaluation</span>
          <span>{formatTimestamp(repository.latestEvaluationAt)}</span>
        </div>
      </div>
      <div className="state-actions">
        <RepositoryAction repository={repository} />
      </div>
    </article>
  );
}
