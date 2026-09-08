# Limen V2 — P17/P18 Design Specification

Date: 2026-09-05
Status: Approved design, ready for implementation planning after user review
Scope: P17 Submission Snapshot + P18 GitHub App Onboarding

## 1. Objective

Limen V2 begins by preserving the exact hackathon-submitted product and adding a GitHub App product layer without rewriting the existing evaluation engine.

P17 protects the submitted version. P18 makes Limen installable and easier to onboard while preserving the existing GitHub Action as the evidence and decision engine.

The architecture deliberately keeps these responsibilities separate:

- GitHub App: identity, installation, repository selection, setup PRs, webhooks, future remediation actions.
- GitHub Action: repository evidence, Telegraph CVE_LOOKUP, limen.yml policy evaluation, deterministic PASS/HOLD/REVIEW.
- Limen backend: GitHub OAuth/session handling, GitHub App installation metadata, webhook verification, OIDC verification, repository state, setup orchestration.
- GitHub Secrets: developer-owned LIMEN_TELEGRAPH_PRIVATE_KEY. Limen never receives or stores it.

This creates the foundation for later remediation phases: recommendation, one-click remediation PRs, re-evaluation, AI-assisted remediation, and policy-based auto-remediation.

## 2. Non-goals

P18 does not:

- replace the existing GitHub Action evaluation engine;
- store or proxy Telegraph private keys;
- directly commit setup files to the default branch;
- implement AI-assisted fixes;
- implement automatic remediation;
- build a large security dashboard;
- request GitHub permissions that are not required for onboarding/setup PRs;
- change the semantics of PASS, HOLD, REVIEW, or setup failure.

## 3. P17 — Submission Snapshot

Before V2 behavior is introduced, preserve the hackathon-submitted version as an immutable release/tag.

Requirements:

- Tag the exact submitted commit.
- Preserve current demo URLs, receipts, Judge Mode runs, and historical evidence unchanged.
- Do not rewrite historical receipts or imply that V2 behavior existed in the submitted build.
- Continue V2 work separately from the immutable submission snapshot.

Acceptance criterion: a judge can still reproduce and inspect the submitted version after V2 work begins.

## 4. P18 — User Journey

Primary onboarding flow:

1. Developer signs into Limen with GitHub.
2. Developer installs the Limen GitHub App on a personal account or GitHub Organization.
3. GitHub controls whether the user has permission to install the App for that account/org.
4. Developer grants Limen access to selected repositories.
5. Developer returns to Limen.
6. Limen lists repositories available through the installation.
7. Developer selects a repository.
8. Limen shows the proposed setup.
9. Developer clicks Create Setup PR.
10. Limen creates a setup branch and opens a PR containing:
   - a secure default limen.yml;
   - the Limen GitHub Action workflow.
11. Developer adds LIMEN_TELEGRAPH_PRIVATE_KEY to GitHub Actions Secrets manually.
12. Developer reviews/edits policy in the setup PR if desired.
13. Developer merges the setup PR.
14. Repository becomes CONFIGURED.
15. A real subsequent Limen evaluation completes.
16. GitHub Action reports the result to Limen using GitHub OIDC.
17. Repository becomes VERIFIED and the control page shows the latest PASS/HOLD/REVIEW.

Limen does not automatically create setup PRs for every repository in an installation. Setup is explicit per repository.

## 5. Architecture

### 5.1 GitHub App

Responsibilities:

- GitHub-native installation flow.
- Personal and organization installation support.
- Repository selection.
- Setup PR creation.
- Short-lived installation token generation through the backend.
- Webhook event delivery to Limen.
- Future foundation for remediation PRs.

The GitHub App does not execute the core release decision itself in P18.

### 5.2 GitHub Action

The existing GitHub Action remains the evaluation engine.

Responsibilities remain:

- collect repository-specific dependency evidence;
- obtain separately routed Telegraph CVE_LOOKUP evidence;
- evaluate limen.yml deterministically;
- return PASS, HOLD, or REVIEW;
- report a completed evaluation to Limen through an OIDC-authenticated callback.

The Action must not silently convert uncertainty, service failure, or malformed evidence into PASS.

### 5.3 Limen Backend

Responsibilities:

- GitHub sign-in/session integration;
- GitHub App installation metadata;
- repository metadata and onboarding state;
- GitHub webhook signature verification;
- idempotent webhook processing;
- short-lived GitHub installation token generation;
- setup PR orchestration;
- GitHub OIDC verification for Action callbacks;
- repository evaluation status updates.

No long-lived GitHub installation access token is stored in Supabase.

### 5.4 Supabase

Reuse the existing backend/database.

Store metadata only for GitHub integration and evaluation references.

Conceptual tables:

#### github_users
- GitHub user ID
- username
- display metadata needed by Limen

#### github_installations
- GitHub installation ID
- account ID
- account login
- account type (user/org)
- connection state
- timestamps

#### github_repositories
- GitHub repository ID
- installation ID
- owner/name
- default branch
- repository lifecycle state
- timestamps

#### github_setup_prs
- repository ID
- PR number
- setup branch name
- open/merged/closed state
- timestamps

#### repository_evaluations
- repository ID
- GitHub run ID
- workflow identity/reference
- commit SHA
- PASS/HOLD/REVIEW
- evidence/receipt references where appropriate
- evaluation timestamp

Do not duplicate sensitive Telegraph evidence unnecessarily. Existing ledger/receipt boundaries remain intact.

## 6. Authentication

GitHub is the Limen account for P18.

- No separate email/password account system.
- Use GitHub-native authentication through the existing auth stack.
- A signed-in user may only act on repositories available through GitHub App installations they are authorized to use.

## 7. GitHub App Permissions

Request the minimum repository permissions required for P18:

- Metadata: Read
- Contents: Read and Write
- Pull Requests: Read and Write
- Workflows: Read and Write — required only because the setup PR creates `.github/workflows/limen.yml`

`Workflows: Write` is distinct from `Actions: Read`. Do not request Actions: Read in P18 unless implementation proves it is strictly necessary.

Do not request repository administration, secrets access, deployments, issues, or unrelated permissions.

Write access is used only to create setup branches/commits and setup PRs in P18. Future remediation use is outside P18 scope.

## 8. Setup PR Behavior

When Create Setup PR is requested:

1. Resolve the repository and default branch through the authorized GitHub App installation.
2. Read the current base branch state.
3. Create an isolated setup branch.
4. Propose a secure default limen.yml.
5. Propose the Limen workflow file.
6. Open a pull request against the default branch.

Rules:

- Never commit directly to the default branch.
- Never blindly overwrite an existing limen.yml, limen.yaml, or Limen workflow.
- Existing-file conflicts must be surfaced as a reviewable setup condition.
- Duplicate requests must not create duplicate setup PRs.
- Setup PR state must remain synchronized through webhook events.

The generated default policy should preserve Limen's current secure behavior, including blocking high/critical runtime findings and routing uncertainty to REVIEW.

## 9. Telegraph Secret Boundary

LIMEN_TELEGRAPH_PRIVATE_KEY remains a GitHub Actions Secret owned by the repository maintainer.

P18 requirements:

- Limen never asks the developer to paste the private key into Limen.
- Limen never receives, reads, proxies, or stores the key.
- Onboarding instructs the developer to add the secret directly in GitHub.
- Missing/malformed secret is an integration/configuration failure and must not become PASS.

## 10. Webhooks

Use GitHub webhooks rather than polling for installation/repository/setup lifecycle state.

Initial event set should be the smallest set required, expected to include:

- installation
- installation_repositories
- pull_request

Requirements:

- Verify GitHub webhook signatures before processing.
- Reject invalid signatures.
- Make handling idempotent using GitHub delivery IDs or equivalent durable deduplication.
- Duplicate deliveries must not create duplicate setup PRs or corrupt repository state.
- Uninstall/removal events must revoke Limen automation state immediately.

## 11. GitHub Action → Limen OIDC Callback

The generated workflow may request:

- contents: read
- id-token: write

After an evaluation is complete, the Action obtains a short-lived GitHub OIDC identity and sends the evaluation result to Limen.

Limen verifies at minimum:

- token signature and issuer;
- intended audience;
- repository identity;
- workflow identity/reference;
- run identity where available;
- repository is connected to an active Limen installation;
- callback claims match the repository being updated.

A spoofed or mismatched callback is rejected.

No LIMEN_API_KEY or other long-lived repository callback credential is introduced.

## 12. Repository Lifecycle

Repository integration states:

- SETUP_REQUIRED
- SETUP_PR_OPEN
- CONFIGURED
- VERIFIED
- NEEDS_ATTENTION
- DISCONNECTED

Expected transitions:

SETUP_REQUIRED -> SETUP_PR_OPEN -> CONFIGURED -> VERIFIED

Additional transitions:

- Setup PR closed without merge -> SETUP_REQUIRED
- Integration/configuration fault -> NEEDS_ATTENTION
- App/repository removed -> DISCONNECTED
- Reinstall/reconnect -> new authorized onboarding flow

Important semantic separation:

- REVIEW is a release decision caused by uncertain, missing, conflicting, malformed, or unavailable evidence while Limen itself is operating.
- NEEDS_ATTENTION means the Limen integration/configuration itself is not healthy.

Examples:

- missing Telegraph secret -> NEEDS_ATTENTION
- Telegraph evidence conflict after a valid evaluation -> REVIEW

## 13. Repository Control Page

P18 adds a deliberately small repository-focused control page.

Per repository show:

- owner/name
- setup/integration status
- setup PR link if applicable
- latest PASS/HOLD/REVIEW if available
- last evaluation time
- one context-aware primary action such as Create setup PR, View setup PR, Fix setup, or View evaluation

Do not build a large security dashboard in P18.

This page becomes the future surface for remediation controls.

## 14. Multi-Repository and Organization Behavior

One GitHub App installation can expose many repositories.

Each repository is independent with its own:

- setup state;
- limen.yml;
- latest release decision;
- evaluation history;
- future remediation history.

No organization-wide policy is forced in P18.

Support both personal and organization installations from the first P18 release. GitHub remains the authority for installation permissions/approval.

## 15. Disconnect Behavior

When Limen is uninstalled or repository access is removed:

- stop all GitHub automation immediately;
- repository becomes DISCONNECTED;
- no new setup/remediation actions may be performed;
- do not retain short-lived GitHub installation access tokens;
- preserve prior sanitized evaluation history/receipts for auditability;
- allow clean reconnection through a future authorized installation.

## 16. Failure Handling

Fail safely.

- GitHub installation token failure -> setup/action fails; no partial silent success.
- invalid webhook signature -> reject.
- invalid/mismatched OIDC identity -> reject.
- missing Telegraph secret -> NEEDS_ATTENTION.
- Telegraph unavailable during a valid evaluation -> REVIEW according to existing decision semantics.
- setup PR closed without merge -> SETUP_REQUIRED.
- app/repository removed -> DISCONNECTED.
- duplicate webhook -> idempotent no-op or safe state reconciliation.
- existing setup-file conflict -> explicit reviewable condition; no overwrite.

Nothing silently becomes PASS.

## 17. Testing Requirements

P18 is not complete without coverage for:

- GitHub webhook signature verification;
- invalid webhook rejection;
- duplicate webhook delivery/idempotency;
- GitHub installation authorization;
- unauthorized repository access rejection;
- personal installations;
- organization installations;
- setup PR generation;
- existing-file conflict handling;
- setup PR merge/close state transitions;
- OIDC verification;
- spoofed/mismatched OIDC rejection;
- repository ownership/install boundaries;
- disconnect/uninstall behavior;
- repository lifecycle transitions;
- regression of the existing P0-P16 evaluation behavior.

No paid Telegraph calls are required merely to prove GitHub App plumbing. Existing test doubles/fixtures should be used for integration logic, while existing validated Telegraph evidence remains unchanged.

## 18. P18 Acceptance Criteria

P18 is complete only when a first-time developer can perform this journey end-to-end:

1. Sign in with GitHub.
2. Install Limen on a personal account or organization.
3. Select one or more repositories.
4. See those repositories in Limen.
5. Choose a repository and inspect proposed setup.
6. Click Create Setup PR.
7. Review a PR containing a safe default limen.yml and Limen workflow.
8. Add LIMEN_TELEGRAPH_PRIVATE_KEY directly in GitHub Secrets.
9. Merge the setup PR.
10. See the repo become CONFIGURED.
11. Run a real Limen evaluation on a repository PR.
12. Have the Action authenticate its callback through GitHub OIDC.
13. See PASS/HOLD/REVIEW in Limen.
14. See the repo become VERIFIED after the first successful evaluation.
15. Disconnect the repository/App and see automation stop while historical sanitized evidence remains.

## 19. Forward Compatibility With Remediation Roadmap

P18 is intentionally designed to support the five remediation capabilities without implementing them yet:

- P19 Remediation Recommendation
- P20 One-Click Remediation PR
- P21 Automatic Re-evaluation
- P23 AI-Assisted Remediation
- P24 Policy-Based Auto-Remediation

P22 adds remediation history/UI between the deterministic and AI layers.

The GitHub App's write path established in P18 will later be reused for remediation branches and PRs. The existing Action remains the independent evaluator that decides whether a proposed remediation actually crosses the repository's release threshold.

## 20. Architectural Invariants

These must remain true through implementation:

1. HOLD requires repository-specific evidence matching policy.
2. Telegraph is an evidence source, not the repository exploitability authority.
3. REVIEW remains first-class for uncertainty/conflict/unavailability.
4. Configuration failure remains distinct from REVIEW.
5. Nothing silently becomes PASS.
6. Limen never receives or stores developers' Telegraph private keys in P18.
7. GitHub installation tokens are short-lived and are not persisted.
8. Setup changes are proposed through PRs, never silently committed to the default branch.
9. The GitHub App does not replace the existing deterministic evaluation engine in P18.
10. The hackathon-submitted version remains reproducible and historically accurate.
