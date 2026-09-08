import {
  REPOSITORY_LIFECYCLE_STATES,
  type RepositoryLifecycleState,
} from "../../packages/github-app/src/types";

const LIFECYCLE_LABELS: Record<RepositoryLifecycleState, string> = {
  SETUP_REQUIRED: "Setup required",
  SETUP_PR_OPEN: "Setup PR open",
  CONFIGURED: "Configured",
  VERIFIED: "Verified",
  NEEDS_ATTENTION: "Needs attention",
  DISCONNECTED: "Disconnected",
};

export { REPOSITORY_LIFECYCLE_STATES };

export function repositoryLifecycleLabel(state: RepositoryLifecycleState): string {
  return LIFECYCLE_LABELS[state];
}

export function RepositoryStatus({ state }: { state: RepositoryLifecycleState }) {
  const label = repositoryLifecycleLabel(state);
  return <span className="context-tag" aria-label={`Integration status: ${label}`}>{label}</span>;
}
