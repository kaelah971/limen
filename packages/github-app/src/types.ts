export const REPOSITORY_LIFECYCLE_STATES = [
  "SETUP_REQUIRED",
  "SETUP_PR_OPEN",
  "CONFIGURED",
  "VERIFIED",
  "NEEDS_ATTENTION",
  "DISCONNECTED",
] as const;

export type RepositoryLifecycleState =
  (typeof REPOSITORY_LIFECYCLE_STATES)[number];

export type RepositoryLifecycleEvent =
  | "SETUP_PR_OPENED"
  | "SETUP_PR_MERGED"
  | "SETUP_PR_CLOSED"
  | "EVALUATION_ACCEPTED"
  | "INTEGRATION_FAULT"
  | "DISCONNECTED"
  | "RECONNECTED";

export type LimenReleaseDecision = "PASS" | "HOLD" | "REVIEW";

type TransitionTable = Partial<
  Record<
    RepositoryLifecycleState,
    Partial<Record<RepositoryLifecycleEvent, RepositoryLifecycleState>>
  >
>;

const TRANSITIONS: TransitionTable = {
  SETUP_REQUIRED: {
    SETUP_PR_OPENED: "SETUP_PR_OPEN",
  },
  SETUP_PR_OPEN: {
    SETUP_PR_MERGED: "CONFIGURED",
    SETUP_PR_CLOSED: "SETUP_REQUIRED",
  },
  CONFIGURED: {
    EVALUATION_ACCEPTED: "VERIFIED",
  },
  VERIFIED: {
    INTEGRATION_FAULT: "NEEDS_ATTENTION",
    DISCONNECTED: "DISCONNECTED",
  },
  DISCONNECTED: {
    RECONNECTED: "SETUP_REQUIRED",
  },
};

export class GitHubAppStateError extends Error {
  readonly current: RepositoryLifecycleState;
  readonly event: RepositoryLifecycleEvent;

  constructor(current: RepositoryLifecycleState, event: RepositoryLifecycleEvent) {
    super(`Invalid repository lifecycle transition: ${current} + ${event}.`);
    this.name = "GitHubAppStateError";
    this.current = current;
    this.event = event;
  }
}

export function transitionRepositoryState(
  current: RepositoryLifecycleState,
  event: RepositoryLifecycleEvent,
): RepositoryLifecycleState {
  const next = TRANSITIONS[current]?.[event];
  if (next === undefined) {
    throw new GitHubAppStateError(current, event);
  }

  return next;
}
