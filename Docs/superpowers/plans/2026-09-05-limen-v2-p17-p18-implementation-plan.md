# Limen V2 P17–P18 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the exact Telegraph hackathon submission and add a production-shaped GitHub App onboarding layer that installs Limen through explicit setup PRs while keeping the existing GitHub Action as the release-evaluation engine.

**Architecture:** P17 creates an immutable tag for the exact submitted commit and starts V2 development separately. P18 adds a small `packages/github-app` boundary, extends the existing `apps/api` backend for authenticated installation/webhook/setup/OIDC flows, adds Supabase metadata tables, adds GitHub-authenticated onboarding pages to the existing Next.js app, and adds an optional OIDC callback path to the existing Action without changing PASS/HOLD/REVIEW semantics.

**Tech Stack:** TypeScript, Next.js App Router, Node.js, Vitest, Supabase/Postgres, GitHub Apps REST API, GitHub webhooks, GitHub Actions OIDC, `@actions/core`, `jose`, existing Limen packages and Action bundle.

**Spec:** `docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md`

## Global Constraints

- The exact hackathon-submitted commit is `6a763acf0f58c03f42b0d121103640691ff96825`; preserve it unchanged under an immutable annotated tag.
- Do not rewrite historical demo evidence, receipts, Judge Mode runs, or claims.
- GitHub App and GitHub Action remain separate: App = installation/setup/future remediation; Action = repository evidence + Telegraph + policy + PASS/HOLD/REVIEW.
- `LIMEN_TELEGRAPH_PRIVATE_KEY` remains a repository GitHub Secret; Limen must never receive, proxy, log, or store it.
- `TELEGRAPH_ENGINE_URL` remains a GitHub repository Actions Variable referenced as `${{ vars.TELEGRAPH_ENGINE_URL }}`; do not hardcode the current HTTP testnet route into P18 production setup.
- GitHub installation access tokens are short-lived and must never be persisted.
- Setup changes are always proposed in a PR; never commit directly to the default branch.
- GitHub App repository permissions: Metadata read, Contents read/write, Pull Requests read/write, Workflows read/write. Do not request Actions read.
- `Workflows: write` is required only because Limen creates `.github/workflows/limen.yml` in the setup PR.
- Never trust a setup redirect `installation_id` by itself. A repository action requires an authenticated Limen user plus independently verified installation state from signed GitHub webhook data.
- Repository lifecycle values are exactly: `SETUP_REQUIRED`, `SETUP_PR_OPEN`, `CONFIGURED`, `VERIFIED`, `NEEDS_ATTENTION`, `DISCONNECTED`.
- `REVIEW` remains a release decision. `NEEDS_ATTENTION` remains an integration/configuration state. Do not merge those concepts.
- Existing release semantics stay unchanged: uncertainty/conflict/unavailability never silently becomes PASS; HOLD still requires repository-specific evidence matching policy.
- Generated default policy blocks `critical` and `high` runtime findings and maps all current uncertainty fields to `review`.
- Generated workflow requests only `contents: read` and `id-token: write` at runtime.
- No paid Telegraph request is required to prove P18 GitHub App plumbing. Use fixtures/test doubles for onboarding tests.
- Do not introduce AI remediation, auto-remediation, organization-wide policy, billing, RBAC, or a large dashboard in P18.
- Preserve the approved Limen visual system; P18 adds small onboarding/control surfaces only.

---

## File Structure

### Existing files expected to be modified

- `package.json` — add only missing dependencies/scripts needed by P18.
- `apps/api/src/config.ts` — validate GitHub App/OIDC/public endpoint configuration.
- `apps/api/src/server.ts` — mount new GitHub App routes without embedding their business logic.
- `action.yml` — expose optional Limen callback URL input.
- `action/src/inputs.ts` — parse optional callback configuration.
- `action/src/orchestrate.ts` — invoke callback only after canonical decision exists.
- `action/dist/index.js` — rebuilt committed Action bundle.
- `app/lib/setup-contract.ts` — generate the P18 workflow/policy contract from validated configuration.
- `tests/ui.test.ts` — extend setup/onboarding UI assertions only where existing test patterns require it.
- `Docs/security-model.md` — document new GitHub App/OIDC boundaries.

### New files

- `docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md`
- `docs/superpowers/plans/2026-09-05-limen-v2-p17-p18-implementation-plan.md`
- `Docs/github-app.md`
- `Docs/submission-snapshot-telegraph-track3-2026.md`
- `packages/github-app/package.json`
- `packages/github-app/src/types.ts`
- `packages/github-app/src/config.ts`
- `packages/github-app/src/webhook.ts`
- `packages/github-app/src/client.ts`
- `packages/github-app/src/setup.ts`
- `packages/github-app/src/oidc.ts`
- `packages/github-app/src/index.ts`
- `apps/api/src/user-auth.ts`
- `apps/api/src/github-app-store.ts`
- `apps/api/src/github-app-routes.ts`
- `supabase/migrations/20260905000000_create_github_app_onboarding.sql`
- `action/src/limen-callback.ts`
- `app/lib/supabase/server.ts`
- `app/lib/supabase/browser.ts`
- `app/auth/callback/route.ts`
- `app/install/page.tsx`
- `app/github/installed/page.tsx`
- `app/repositories/page.tsx`
- `app/repositories/[owner]/[repo]/page.tsx`
- `app/components/github-install-card.tsx`
- `app/components/repository-card.tsx`
- `app/components/repository-status.tsx`
- `tests/github-app-domain.test.ts`
- `tests/github-webhook.test.ts`
- `tests/github-setup.test.ts`
- `tests/github-oidc.test.ts`
- `tests/github-api.test.ts`
- `tests/github-onboarding-ui.test.ts`
- `tests/action-callback.test.ts`

If any expected existing path above does not exist in the current checkout, stop that task and report the actual path before editing. Do not create a parallel duplicate of an existing responsibility.

---

### Task 1: P17 Submission Snapshot and V2 Branch

**Files:**
- Create: `Docs/submission-snapshot-telegraph-track3-2026.md`
- Create: `docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md`
- Create: `docs/superpowers/plans/2026-09-05-limen-v2-p17-p18-implementation-plan.md`

**Interfaces:**
- Consumes: submitted commit `6a763acf0f58c03f42b0d121103640691ff96825`.
- Produces: immutable annotated tag `telegraph-track3-submission-2026-09-05` and development branch `v2/github-app-onboarding`.

- [ ] **Step 1: Verify the submitted commit exists and inspect it without changing files**

Run:

```bash
git cat-file -e 6a763acf0f58c03f42b0d121103640691ff96825^{commit}
git show --no-patch --format='%H%n%s%n%ci' 6a763acf0f58c03f42b0d121103640691ff96825
git status --short
```

Expected:
- `git cat-file` exits 0.
- The displayed SHA is exactly `6a763acf0f58c03f42b0d121103640691ff96825`.
- Worktree is clean before snapshot work.

- [ ] **Step 2: Create and verify the immutable annotated submission tag**

Run:

```bash
if git rev-parse telegraph-track3-submission-2026-09-05 >/dev/null 2>&1; then
  test "$(git rev-list -n 1 telegraph-track3-submission-2026-09-05)" = "6a763acf0f58c03f42b0d121103640691ff96825"
else
  git tag -a telegraph-track3-submission-2026-09-05 \
    6a763acf0f58c03f42b0d121103640691ff96825 \
    -m "Telegraph Track 3 submission snapshot — 2026-09-05"
fi

git rev-list -n 1 telegraph-track3-submission-2026-09-05
```

Expected output SHA:

```text
6a763acf0f58c03f42b0d121103640691ff96825
```

- [ ] **Step 3: Add the snapshot record**

Create `Docs/submission-snapshot-telegraph-track3-2026.md` with:

```markdown
# Telegraph Track 3 Submission Snapshot

Submitted product: Limen — Release Evidence Gate
Submission date: 2026-09-05
Immutable source commit: `6a763acf0f58c03f42b0d121103640691ff96825`
Immutable tag: `telegraph-track3-submission-2026-09-05`

This snapshot preserves the exact codebase submitted to Telegraph Track 3 before Limen V2 GitHub App work began.

Historical demo evidence, receipts, Judge Mode runs, and submission claims remain attached to their original timestamps and must not be rewritten to imply that later V2 behavior existed in the submitted build.

V2 work begins after this snapshot and may change `main` without changing the tag above.
```

- [ ] **Step 4: Copy the approved design and implementation plan into the repository**

Place the approved files at:

```text
docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md
docs/superpowers/plans/2026-09-05-limen-v2-p17-p18-implementation-plan.md
```

Then run:

```bash
grep -F "6a763acf0f58c03f42b0d121103640691ff96825" Docs/submission-snapshot-telegraph-track3-2026.md
grep -F "Workflows: Read and Write" docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md
```

Expected: both commands find exactly the intended lines.

- [ ] **Step 5: Commit P17 documentation**

```bash
git add Docs/submission-snapshot-telegraph-track3-2026.md docs/superpowers/specs/2026-09-05-limen-v2-p17-p18-design.md docs/superpowers/plans/2026-09-05-limen-v2-p17-p18-implementation-plan.md
git commit -m "docs: freeze Telegraph submission and plan Limen V2"
```

- [ ] **Step 6: Push the immutable tag and create the V2 branch**

```bash
git push origin telegraph-track3-submission-2026-09-05
git switch -c v2/github-app-onboarding
git push -u origin v2/github-app-onboarding
```

Expected: tag push succeeds and current branch is `v2/github-app-onboarding`.

---

### Task 2: GitHub App Domain Package and Configuration

**Files:**
- Create: `packages/github-app/package.json`
- Create: `packages/github-app/src/types.ts`
- Create: `packages/github-app/src/config.ts`
- Create: `packages/github-app/src/index.ts`
- Modify: `package.json`
- Test: `tests/github-app-domain.test.ts`

**Interfaces:**
- Consumes: environment variables `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `LIMEN_GITHUB_OIDC_AUDIENCE`, `LIMEN_ACTION_SHA`.
- Produces:
  - `RepositoryLifecycleState`
  - `GitHubAppConfig`
  - `loadGitHubAppConfig(env)`
  - `transitionRepositoryState(current, event)`

- [ ] **Step 1: Write domain-state tests**

Create `tests/github-app-domain.test.ts` covering these exact transitions:

```typescript
expect(transitionRepositoryState("SETUP_REQUIRED", "SETUP_PR_OPENED")).toBe("SETUP_PR_OPEN");
expect(transitionRepositoryState("SETUP_PR_OPEN", "SETUP_PR_MERGED")).toBe("CONFIGURED");
expect(transitionRepositoryState("CONFIGURED", "EVALUATION_ACCEPTED")).toBe("VERIFIED");
expect(transitionRepositoryState("SETUP_PR_OPEN", "SETUP_PR_CLOSED")).toBe("SETUP_REQUIRED");
expect(transitionRepositoryState("VERIFIED", "INTEGRATION_FAULT")).toBe("NEEDS_ATTENTION");
expect(transitionRepositoryState("VERIFIED", "DISCONNECTED")).toBe("DISCONNECTED");
```

Also test that `REVIEW` is not a repository lifecycle value.

- [ ] **Step 2: Run the test and verify it fails because the package does not exist**

```bash
npm test -- tests/github-app-domain.test.ts
```

Expected: FAIL on unresolved `@limen/github-app` or missing exports.

- [ ] **Step 3: Implement exact domain contracts**

In `packages/github-app/src/types.ts`, define:

```typescript
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
```

Implement `transitionRepositoryState()` as an explicit switch/table. Invalid transitions throw a typed `GitHubAppStateError`; do not silently coerce.

- [ ] **Step 4: Write configuration tests**

Test:
- numeric positive `GITHUB_APP_ID`;
- non-empty slug;
- PEM private key accepts escaped `\\n` and normalizes to real newlines;
- webhook secret minimum length 32;
- OIDC audience equals configured literal, default `limen-api`;
- `LIMEN_ACTION_SHA` must be exactly 40 hex characters;

- [ ] **Step 5: Implement `loadGitHubAppConfig(env)`**

Return:

```typescript
export interface GitHubAppConfig {
  appId: number;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  oidcAudience: string;
  actionSha: string;
}
```

Never log the private key or webhook secret. Error messages name the variable but never include its value.

- [ ] **Step 6: Run focused tests**

```bash
npm test -- tests/github-app-domain.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/github-app tests/github-app-domain.test.ts
git commit -m "feat: add GitHub App domain boundary"
```

---

### Task 3: Supabase GitHub App Metadata Schema

**Files:**
- Create: `supabase/migrations/20260905000000_create_github_app_onboarding.sql`
- Test: `tests/github-api.test.ts`

**Interfaces:**
- Consumes: existing Supabase service-role backend pattern.
- Produces tables `github_users`, `github_installations`, `github_repositories`, `github_setup_prs`, `github_webhook_deliveries`, `repository_evaluations`.

- [ ] **Step 1: Add a schema-contract test that reads the migration text**

The test must assert the migration includes:

```text
github_users
github_installations
github_repositories
github_setup_prs
github_webhook_deliveries
repository_evaluations
SETUP_REQUIRED
SETUP_PR_OPEN
CONFIGURED
VERIFIED
NEEDS_ATTENTION
DISCONNECTED
PASS
HOLD
REVIEW
```

It must also assert no column name contains `private_key`, `installation_token`, or `telegraph_private_key`.

- [ ] **Step 2: Run the test and verify it fails because the migration is absent**

```bash
npm test -- tests/github-api.test.ts
```

Expected: FAIL on missing migration file.

- [ ] **Step 3: Create the migration**

Use these core columns and constraints:

```sql
create table public.github_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null unique check (github_user_id > 0),
  github_login text not null check (length(github_login) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.github_installations (
  installation_id bigint primary key check (installation_id > 0),
  account_id bigint not null check (account_id > 0),
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  installed_by_github_user_id bigint not null check (installed_by_github_user_id > 0),
  bound_by_auth_user_id uuid null references public.github_users(auth_user_id) on delete set null,
  connection_state text not null check (connection_state in ('ACTIVE', 'DISCONNECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.github_repositories (
  repository_id bigint primary key check (repository_id > 0),
  installation_id bigint not null references public.github_installations(installation_id),
  owner_login text not null,
  repository_name text not null,
  full_name text not null unique,
  default_branch text not null,
  lifecycle_state text not null check (lifecycle_state in ('SETUP_REQUIRED','SETUP_PR_OPEN','CONFIGURED','VERIFIED','NEEDS_ATTENTION','DISCONNECTED')),
  latest_decision text null check (latest_decision is null or latest_decision in ('PASS','HOLD','REVIEW')),
  latest_evaluation_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Add:
- setup PR table with `repository_id`, `pr_number`, `branch_name`, `state` (`OPEN`,`MERGED`,`CLOSED`), timestamps;
- partial unique index that permits at most one `OPEN` setup PR per repository;
- webhook delivery table keyed by `delivery_id text primary key` for idempotency;
- evaluation table unique on `(repository_id, github_run_id, run_attempt)`;
- `workflow_ref`, `commit_sha`, `decision`, optional `receipt_id`, `evaluated_at` on evaluations;
- indexes for installation repositories and latest repository evaluations;
- `bound_by_auth_user_id` starts null on webhook ingestion and is set only after the authenticated installer completes the verified binding flow.

Enable RLS on all six tables and revoke direct anon/authenticated writes. Existing server/service-role access remains the write path.

- [ ] **Step 4: Run migration-contract tests**

```bash
npm test -- tests/github-api.test.ts
```

Expected: PASS for schema assertions.

- [ ] **Step 5: If a local Supabase CLI is configured, validate SQL without touching hosted production**

Run only against local Supabase:

```bash
supabase db reset
```

Expected: all existing migrations plus `20260905000000_create_github_app_onboarding.sql` apply cleanly. If the CLI is unavailable, report that exact limitation and continue with static migration tests; do not apply directly to hosted production in this task.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260905000000_create_github_app_onboarding.sql tests/github-api.test.ts
git commit -m "feat: add GitHub App onboarding schema"
```

---

### Task 4: GitHub Webhook Verification and Installation Lifecycle

**Files:**
- Create: `packages/github-app/src/webhook.ts`
- Create: `apps/api/src/github-app-store.ts`
- Create: `apps/api/src/github-app-routes.ts`
- Modify: `apps/api/src/server.ts`
- Test: `tests/github-webhook.test.ts`

**Interfaces:**
- Consumes: raw request body, `X-Hub-Signature-256`, `X-GitHub-Delivery`, `X-GitHub-Event`.
- Produces:
  - `verifyGitHubWebhookSignature(rawBody, signature, secret): boolean`
  - durable delivery dedupe
  - installation/repository lifecycle updates.

- [ ] **Step 1: Write signature tests with fixed fixture values**

Use Node `createHmac('sha256', secret)` in the test to generate the expected `sha256=...` signature over an exact JSON byte string. Assert:
- valid signature accepted;
- one-byte body change rejected;
- malformed signature rejected;
- missing signature rejected.

- [ ] **Step 2: Write idempotency and lifecycle tests**

Fixtures must cover:
- `installation.created` records installation, webhook `sender.id`, and repositories as `SETUP_REQUIRED`;
- replaying same delivery ID produces no duplicate writes;
- `installation.deleted` changes all attached repositories to `DISCONNECTED`;
- `installation_repositories.added` adds repositories as `SETUP_REQUIRED`;
- `installation_repositories.removed` marks only removed repositories `DISCONNECTED`;
- setup PR `pull_request.closed` with `merged=true` changes repo to `CONFIGURED`;
- setup PR closed unmerged returns it to `SETUP_REQUIRED`.

- [ ] **Step 3: Run tests and verify failures**

```bash
npm test -- tests/github-webhook.test.ts
```

Expected: FAIL on missing verifier/store/route.

- [ ] **Step 4: Implement constant-time webhook verification**

In `packages/github-app/src/webhook.ts`:
- require prefix `sha256=`;
- compute HMAC over raw bytes, not parsed JSON;
- compare equal-length byte arrays using `timingSafeEqual`;
- reject before JSON parsing when invalid.

- [ ] **Step 5: Implement durable delivery dedupe**

`github_webhook_deliveries.delivery_id` is inserted before state mutation in one logical handler. Duplicate primary-key conflict returns a typed `DUPLICATE_DELIVERY` result and performs no second mutation.

- [ ] **Step 6: Mount `POST /v1/github/webhooks`**

The route must:
1. read raw body with a hard byte limit;
2. verify signature;
3. require delivery/event headers;
4. parse known event payloads only;
5. ignore unsupported events with HTTP 202;
6. process installation lifecycle idempotently;
7. return sanitized errors with no webhook secret or payload credentials.

- [ ] **Step 7: Run focused tests**

```bash
npm test -- tests/github-webhook.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/github-app/src/webhook.ts apps/api/src/github-app-store.ts apps/api/src/github-app-routes.ts apps/api/src/server.ts tests/github-webhook.test.ts
git commit -m "feat: process GitHub App lifecycle webhooks"
```

---

### Task 5: Short-Lived Installation Client and Setup PR Generator

**Files:**
- Create: `packages/github-app/src/client.ts`
- Create: `packages/github-app/src/setup.ts`
- Modify: `packages/github-app/src/index.ts`
- Test: `tests/github-setup.test.ts`

**Interfaces:**
- Consumes: active installation ID, repository metadata, validated `GitHubAppConfig`.
- Produces:
  - `withInstallationClient(installationId, fn)` that never persists the token;
  - `inspectSetup(repository)`;
  - `createSetupPullRequest(repository, config)`.

- [ ] **Step 1: Write token-lifetime tests around an injected GitHub transport**

Assert:
- an installation token is requested immediately before API use;
- token is held only in function scope;
- returned domain objects never contain the token;
- logging/redaction never includes the token;
- disconnected installations are rejected before token minting.

- [ ] **Step 2: Write setup preview tests**

For an empty repo, expected preview contains exactly:

`limen.yml`

```yaml
production:
  block_severity:
    - critical
    - high
  dependency_scopes:
    - runtime
  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review
```

`.github/workflows/limen.yml`

```yaml
name: Limen

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened

permissions:
  contents: read
  id-token: write

jobs:
  limen:
    runs-on: ubuntu-latest
    steps:
      - name: Evaluate release evidence
        uses: kaelah971/limen@1111111111111111111111111111111111111111
        with:
          github-token: ${{ github.token }}
          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}
          limen-api-url: https://api.example.test
```

The test config injects SHA `1111111111111111111111111111111111111111`; production uses `LIMEN_ACTION_SHA`.

- [ ] **Step 3: Add existing-file conflict tests**

Assert:
- existing `limen.yml` is never overwritten;
- existing `limen.yaml` counts as policy already present;
- existing `.github/workflows/limen.yml` is never overwritten;
- if one file is missing, the PR contains only the missing file and preview labels the existing file `existing`;
- if both files exist, no branch/commit/PR is created and result is `ALREADY_CONFIGURED_FILES_PRESENT`;
- duplicate setup calls while an OPEN setup PR exists return the same PR record.

- [ ] **Step 4: Run tests and verify failures**

```bash
npm test -- tests/github-setup.test.ts
```

Expected: FAIL on missing setup service.

- [ ] **Step 5: Implement installation authentication**

Use the GitHub App JWT/private key only server-side to mint a one-hour installation access token. Do not write it to database, cookies, logs, or response objects.

- [ ] **Step 6: Implement repository-safe setup inspection**

Read default branch and exact paths:
- `limen.yml`
- `limen.yaml`
- `.github/workflows/limen.yml`

Only HTTP 404 means absent. 401/403/rate-limit/network/malformed responses are setup failures, not “file missing”.

- [ ] **Step 7: Implement setup PR creation through GitHub REST**

Sequence:
1. read default branch ref and head SHA;
2. create unique setup branch `limen/setup-<repository-id>-<unix-seconds>`;
3. create only missing files with GitHub contents API on that branch;
4. open PR titled `Configure Limen release evidence gate`;
5. body explicitly tells maintainer to add `LIMEN_TELEGRAPH_PRIVATE_KEY` in GitHub Secrets and `TELEGRAPH_ENGINE_URL` in GitHub repository Variables; it warns never to paste the private key into Limen and does not hardcode the current HTTP testnet endpoint;
6. persist setup PR record and state `SETUP_PR_OPEN`.

If any step fails after branch creation, return an explicit setup error and never mark the repo configured.

- [ ] **Step 8: Run focused tests**

```bash
npm test -- tests/github-setup.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/github-app/src/client.ts packages/github-app/src/setup.ts packages/github-app/src/index.ts tests/github-setup.test.ts
git commit -m "feat: create explicit Limen setup pull requests"
```

---

### Task 6: GitHub-Signed User Session and Installation Authorization

**Files:**
- Create: `apps/api/src/user-auth.ts`
- Modify: `apps/api/src/github-app-routes.ts`
- Create: `app/lib/supabase/server.ts`
- Create: `app/lib/supabase/browser.ts`
- Create: `app/auth/callback/route.ts`
- Test: `tests/github-api.test.ts`

**Interfaces:**
- Consumes: Supabase access token from the web session and GitHub identity metadata.
- Produces:
  - `authenticateUser(request)` returning `{ authUserId, githubUserId, githubLogin }`;
  - installation authorization requiring signed webhook state.

- [ ] **Step 1: Write auth-boundary tests**

Assert:
- missing bearer token -> 401;
- invalid Supabase token -> 401;
- authenticated user without GitHub identity -> 403;
- authenticated GitHub user can bind an installation only when `installed_by_github_user_id` equals their GitHub ID;
- spoofed setup redirect `installation_id` for another sender -> 403;
- disconnected installation -> 409;
- an installation ID absent from signed webhook state -> 409 `INSTALLATION_NOT_CONFIRMED`.

- [ ] **Step 2: Run tests and verify failures**

```bash
npm test -- tests/github-api.test.ts
```

Expected: FAIL on missing auth boundary.

- [ ] **Step 3: Implement server-side Supabase user verification**

Use existing `SUPABASE_URL` and server credentials to call Supabase Auth `getUser(accessToken)` or the existing repository-standard equivalent. Do not decode an unverified JWT and trust its payload.

Extract the GitHub provider identity from verified auth user identity data. Upsert only:
- Supabase auth user UUID;
- GitHub numeric user ID;
- GitHub login.

Do not persist the GitHub OAuth provider access token.

- [ ] **Step 4: Implement installation-binding endpoint**

Add:

```text
POST /v1/github/installations/:installationId/bind
```

Authorization conditions:
1. Limen user authenticated;
2. installation exists from verified webhook processing;
3. installation is ACTIVE;
4. webhook `installed_by_github_user_id` equals authenticated GitHub user ID.

A raw `installation_id` URL parameter alone never authorizes anything. On successful binding, set `github_installations.bound_by_auth_user_id` to the matching authenticated `github_users.auth_user_id`. Repository APIs in P18 authorize through that durable binding.

- [ ] **Step 5: Implement Supabase SSR helpers and OAuth callback**

`app/auth/callback/route.ts` exchanges the Supabase PKCE code and redirects to `/install`. On auth failure, redirect to `/install?auth=failed`; never expose tokens in query parameters.

- [ ] **Step 6: Run focused tests**

```bash
npm test -- tests/github-api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/user-auth.ts apps/api/src/github-app-routes.ts app/lib/supabase app/auth/callback/route.ts tests/github-api.test.ts package.json package-lock.json
git commit -m "feat: bind GitHub installations to authenticated users"
```

---

### Task 7: Repository APIs and Explicit Setup Flow

**Files:**
- Modify: `apps/api/src/github-app-routes.ts`
- Modify: `apps/api/src/github-app-store.ts`
- Test: `tests/github-api.test.ts`

**Interfaces:**
- Produces authenticated endpoints:
  - `GET /v1/github/repositories`
  - `GET /v1/github/repositories/:repositoryId`
  - `GET /v1/github/repositories/:repositoryId/setup-preview`
  - `POST /v1/github/repositories/:repositoryId/setup-pr`

- [ ] **Step 1: Write authorization tests**

Assert a user can access only repositories belonging to installations they personally bound in P18. Organization-wide multi-user RBAC is not introduced here.

- [ ] **Step 2: Write setup endpoint tests**

Assert:
- preview is read-only;
- POST is required to create setup PR;
- repository must be ACTIVE and not DISCONNECTED;
- duplicate POST returns existing open setup PR;
- existing files are surfaced rather than overwritten;
- response never contains installation token, GitHub App private key, webhook secret, Telegraph private key, or Supabase service-role key.

- [ ] **Step 3: Run tests and verify failures**

```bash
npm test -- tests/github-api.test.ts
```

Expected: FAIL on missing endpoints.

- [ ] **Step 4: Implement repository endpoints**

Use the authenticated user boundary before repository lookup. Return only sanitized repository metadata:

```typescript
{
  repositoryId,
  owner,
  name,
  fullName,
  defaultBranch,
  lifecycleState,
  latestDecision,
  latestEvaluationAt,
  setupPullRequest?: { number, url, state }
}
```

- [ ] **Step 5: Run focused tests**

```bash
npm test -- tests/github-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/github-app-routes.ts apps/api/src/github-app-store.ts tests/github-api.test.ts
git commit -m "feat: expose authenticated repository onboarding API"
```

---

### Task 8: GitHub Actions OIDC Verification Endpoint

**Files:**
- Create: `packages/github-app/src/oidc.ts`
- Modify: `packages/github-app/src/index.ts`
- Modify: `apps/api/src/github-app-routes.ts`
- Test: `tests/github-oidc.test.ts`

**Interfaces:**
- Consumes: `Authorization: Bearer $OIDC_JWT` and evaluation payload.
- Produces: accepted immutable repository evaluation and `VERIFIED` repository state.

- [ ] **Step 1: Write OIDC claim tests**

Test the verifier against injected JWKS/verification functions so tests do not depend on GitHub network access.

Accepted claims must include and match:

```typescript
{
  iss: "https://token.actions.githubusercontent.com",
  aud: "limen-api",
  repository: "kaelah971/limen-demo",
  repository_id: "123456",
  run_id: "33959096100",
  run_attempt: "1",
  workflow_ref: "kaelah971/limen-demo/.github/workflows/limen.yml@refs/heads/main"
}
```

Reject:
- wrong issuer;
- wrong audience;
- repository ID mismatch;
- repository name mismatch;
- run ID mismatch between token and body;
- unconnected/disconnected repository;
- workflow path not ending in `/.github/workflows/limen.yml@...`;
- duplicate `(repository_id, run_id, run_attempt)` with conflicting decision.

- [ ] **Step 2: Run tests and verify failures**

```bash
npm test -- tests/github-oidc.test.ts
```

Expected: FAIL on missing verifier.

- [ ] **Step 3: Implement GitHub OIDC verification**

Use `jose` remote-JWKS verification against GitHub's OIDC issuer in production, but inject the key resolver in tests.

Validate:
- issuer exactly `https://token.actions.githubusercontent.com`;
- audience exactly configured `LIMEN_GITHUB_OIDC_AUDIENCE`;
- repository/repository_id/run_id/run_attempt/workflow_ref are present and bounded strings;
- repository ID maps to an ACTIVE connected Limen repository;
- token repository name matches stored `full_name`.

- [ ] **Step 4: Add `POST /v1/github/evaluations`**

Body schema:

```typescript
{
  repositoryId: number;
  githubRunId: number;
  githubRunAttempt: number;
  workflowRef: string;
  commitSha: string;
  decision: "PASS" | "HOLD" | "REVIEW";
  receiptId?: string | null;
  evaluatedAt: string;
}
```

After verification:
- insert idempotently;
- update `github_repositories.latest_decision` and `latest_evaluation_at`;
- transition `CONFIGURED` or `NEEDS_ATTENTION` to `VERIFIED` only after an accepted evaluation;
- `REVIEW` is still a valid successful evaluation and therefore can verify integration health.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- tests/github-oidc.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/github-app/src/oidc.ts packages/github-app/src/index.ts apps/api/src/github-app-routes.ts tests/github-oidc.test.ts package.json package-lock.json
git commit -m "feat: verify GitHub Actions OIDC evaluations"
```

---

### Task 9: Action OIDC Callback Without Changing Decision Semantics

**Files:**
- Create: `action/src/limen-callback.ts`
- Modify: `action/src/inputs.ts`
- Modify: `action/src/orchestrate.ts`
- Modify: `action.yml`
- Test: `tests/action-callback.test.ts`
- Rebuild: `action/dist/index.js`

**Interfaces:**
- Consumes: optional Action input `limen-api-url`.
- Produces: OIDC-authenticated callback after a canonical PASS/HOLD/REVIEW is determined.

- [ ] **Step 1: Add callback tests**

Assert:
- no `limen-api-url` -> no callback attempted and current Action behavior is unchanged;
- configured callback -> `core.getIDToken("limen-api")` requested exactly once;
- callback body uses canonical overall decision and GitHub context;
- callback endpoint is `${limenApiUrl}/v1/github/evaluations`;
- callback does not contain GitHub token, Telegraph private key, payment signature, ledger token, or raw Telegraph payload;
- callback network/auth failure marks integration callback failure but does not rewrite PASS/HOLD/REVIEW into another release decision;
- existing final workflow failure behavior remains: PASS succeeds, HOLD fails, REVIEW fails.

- [ ] **Step 2: Run tests and verify failures**

```bash
npm test -- tests/action-callback.test.ts
```

Expected: FAIL on missing callback module/input.

- [ ] **Step 3: Add optional Action input**

In `action.yml`:

```yaml
limen-api-url:
  description: "Optional Limen API base URL for OIDC-authenticated repository status reporting"
  required: false
```

Parse as an HTTPS URL in production. No secret is accepted.

- [ ] **Step 4: Implement the callback module**

Use `@actions/core.getIDToken("limen-api")` only when `limen-api-url` is configured.

Send a bounded JSON body with:
- repository ID/name from GitHub context;
- run ID/attempt;
- workflow ref;
- head commit SHA used by the canonical evaluation;
- PASS/HOLD/REVIEW;
- evaluated timestamp;
- receipt ID only if one already exists in canonical outputs.

No retry loop that could spam callbacks. One bounded request per Action run.

- [ ] **Step 5: Keep callback health separate from release decision**

If the callback fails after any canonical decision, emit a warning and leave the existing Action exit semantics unchanged: PASS still succeeds, HOLD still fails, and REVIEW still fails. Do not fail a PASS solely because control-plane status reporting failed, and do not fabricate REVIEW because external evidence was already evaluated successfully. The repository remains CONFIGURED (or retains its prior lifecycle state) until a later callback is accepted.

- [ ] **Step 6: Run Action tests and full regression tests**

```bash
npm test -- tests/action-callback.test.ts
npm test
```

Expected: all existing P0–P16 tests plus new tests pass.

- [ ] **Step 7: Rebuild and verify the committed Action bundle**

Resolve and run the repository's existing Action build script without inventing a second pipeline:

```bash
ACTION_BUILD_SCRIPT="$(node -e "const s=require('./package.json').scripts||{}; const k=Object.keys(s).find(k=>/action/i.test(k)&&/build/i.test(k)); if(!k) process.exit(2); process.stdout.write(k)")"
npm run "$ACTION_BUILD_SCRIPT"
git diff -- action/dist/index.js
```

Expected: the command resolves one existing package script, rebuilds the tracked Action bundle, and any bundle diff corresponds only to the callback/input source changes. If no matching existing script is found, stop this task and report the repository's scripts instead of inventing a build command.

- [ ] **Step 8: Commit**

```bash
git add action.yml action/src/inputs.ts action/src/orchestrate.ts action/src/limen-callback.ts action/dist/index.js tests/action-callback.test.ts
git commit -m "feat: report Action decisions with GitHub OIDC"
```

---

### Task 10: P18 Workflow/Policy Setup Contract

**Files:**
- Modify: `app/lib/setup-contract.ts`
- Test: `tests/ui.test.ts`
- Test: `tests/github-setup.test.ts`

**Interfaces:**
- Consumes: `LIMEN_ACTION_SHA`, the GitHub variable expression `${{ vars.TELEGRAPH_ENGINE_URL }}`, and public Limen API URL.
- Produces: one canonical setup preview shared by UI and GitHub setup PR generator.

- [ ] **Step 1: Add canonical contract assertions**

Tests must require:
- full immutable 40-character Action SHA;
- `contents: read`;
- `id-token: write`;
- no checkout step;
- no `pull_request_target` trigger;
- `LIMEN_TELEGRAPH_PRIVATE_KEY` only as GitHub secret expression;
- `telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}` with no hardcoded production/testnet endpoint;
- public `limen-api-url` input;
- exact secure default policy from Task 5.

- [ ] **Step 2: Run tests and verify failure against the old P8/P13 setup contract**

```bash
npm test -- tests/ui.test.ts tests/github-setup.test.ts
```

Expected: FAIL until setup contract is updated.

- [ ] **Step 3: Refactor setup generation to one shared source**

`packages/github-app/src/setup.ts` owns semantic file contents. `app/lib/setup-contract.ts` imports/uses that contract rather than duplicating YAML strings.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/ui.test.ts tests/github-setup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/setup-contract.ts packages/github-app/src/setup.ts tests/ui.test.ts tests/github-setup.test.ts
git commit -m "refactor: share canonical GitHub App setup contract"
```

---

### Task 11: GitHub Installation and Repository Control UI

**Files:**
- Create: `app/install/page.tsx`
- Create: `app/github/installed/page.tsx`
- Create: `app/repositories/page.tsx`
- Create: `app/repositories/[owner]/[repo]/page.tsx`
- Create: `app/components/github-install-card.tsx`
- Create: `app/components/repository-card.tsx`
- Create: `app/components/repository-status.tsx`
- Test: `tests/github-onboarding-ui.test.ts`
- Modify: `tests/ui.test.ts`

**Interfaces:**
- Consumes: authenticated repository APIs from Task 7.
- Produces: the approved onboarding journey and small repository control page.

- [ ] **Step 1: Write UI behavior tests**

Required states/copy:
- signed out: `Continue with GitHub`;
- signed in, no installation: `Install Limen GitHub App`;
- installation callback pending webhook confirmation: `Confirming your GitHub installation…`;
- repository `SETUP_REQUIRED`: primary action `Create setup PR`;
- `SETUP_PR_OPEN`: `View setup PR`;
- `CONFIGURED`: explain first successful Limen evaluation is still required;
- `VERIFIED`: show latest PASS/HOLD/REVIEW and time;
- `NEEDS_ATTENTION`: `Fix setup`;
- `DISCONNECTED`: no setup/remediation actions;
- setup instructions explicitly say add `LIMEN_TELEGRAPH_PRIVATE_KEY` in GitHub repository Secrets and `TELEGRAPH_ENGINE_URL` in GitHub repository Variables; never paste the private key into Limen.

- [ ] **Step 2: Run tests and verify failures**

```bash
npm test -- tests/github-onboarding-ui.test.ts tests/ui.test.ts
```

Expected: FAIL on missing pages/components.

- [ ] **Step 3: Implement `/install`**

Keep the existing Limen design language. Page shows:
1. product explanation;
2. GitHub sign-in state;
3. App install CTA built from configured public GitHub App slug;
4. least-privilege permission explanation, including Workflows write specifically because Limen proposes the workflow file;
5. explicit statement that Limen never receives the Telegraph private key.

- [ ] **Step 4: Implement `/github/installed`**

Read `installation_id` only as untrusted input. Submit it to the authenticated bind endpoint. Display:
- success and repository navigation only after backend verifies signed webhook state;
- pending confirmation state on race;
- safe error if ID cannot be authorized.

Never treat the query string itself as proof.

- [ ] **Step 5: Implement repository list and control page**

Repository list shows cards with state and latest decision.

Repository detail shows only:
- repository name;
- integration state;
- setup PR link where applicable;
- latest decision/time;
- one context-aware primary action.

Do not add vulnerability charts, organization policy editors, billing, user management, or remediation controls in P18.

- [ ] **Step 6: Implement explicit setup preview and confirmation**

Before POSTing setup PR creation, show the two proposed files and any `existing` conflict markers. Button text remains `Create setup PR`; no setup PR is created on page load.

- [ ] **Step 7: Run focused UI tests**

```bash
npm test -- tests/github-onboarding-ui.test.ts tests/ui.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/install app/github app/repositories app/components/github-install-card.tsx app/components/repository-card.tsx app/components/repository-status.tsx tests/github-onboarding-ui.test.ts tests/ui.test.ts
git commit -m "feat: add GitHub App onboarding control surface"
```

---

### Task 12: Configuration Failure and `NEEDS_ATTENTION` Semantics

**Files:**
- Modify: `apps/api/src/github-app-routes.ts`
- Modify: `apps/api/src/github-app-store.ts`
- Modify: `app/repositories/[owner]/[repo]/page.tsx`
- Test: `tests/github-api.test.ts`
- Test: `tests/github-onboarding-ui.test.ts`

**Interfaces:**
- Consumes: integration health signals.
- Produces: explicit `NEEDS_ATTENTION` without altering release-decision semantics.

- [ ] **Step 1: Add tests for integration-fault transitions**

Cover:
- setup PR merged but Action callback never arrives -> stays `CONFIGURED`, not `VERIFIED`;
- callback rejected for OIDC mismatch -> state remains unchanged and API rejects request;
- known missing/invalid generated setup configuration -> `NEEDS_ATTENTION`;
- Telegraph evidence timeout in a valid Action evaluation remains `REVIEW`, not `NEEDS_ATTENTION`;
- disconnected repo cannot leave `DISCONNECTED` via stale webhook/callback.

- [ ] **Step 2: Run tests and verify current failures**

```bash
npm test -- tests/github-api.test.ts tests/github-onboarding-ui.test.ts
```

- [ ] **Step 3: Implement explicit integration-health errors**

Use stable codes:

```text
INSTALLATION_NOT_CONFIRMED
INSTALLATION_DISCONNECTED
SETUP_FILES_CONFLICT
SETUP_PR_FAILED
OIDC_REJECTED
CALLBACK_REPOSITORY_MISMATCH
CONFIGURATION_INVALID
```

Do not reuse Limen release reason codes for these integration failures.

- [ ] **Step 4: Render safe next actions**

Examples:
- setup file conflict -> inspect existing configuration;
- disconnected -> reinstall/reconnect;
- configuration invalid -> review setup PR/configuration;
- OIDC/callback problem -> inspect integration setup.

Do not tell the user to paste a private key into Limen.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- tests/github-api.test.ts tests/github-onboarding-ui.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/github-app-routes.ts apps/api/src/github-app-store.ts app/repositories/[owner]/[repo]/page.tsx tests/github-api.test.ts tests/github-onboarding-ui.test.ts
git commit -m "feat: separate integration health from release review"
```

---

### Task 13: Disconnect, Repository Removal, and Historical Preservation

**Files:**
- Modify: `apps/api/src/github-app-store.ts`
- Modify: `apps/api/src/github-app-routes.ts`
- Modify: `packages/github-app/src/webhook.ts`
- Test: `tests/github-webhook.test.ts`
- Test: `tests/github-api.test.ts`

**Interfaces:**
- Consumes: signed uninstall/repository-removal webhooks.
- Produces: `DISCONNECTED` state with retained historical evaluations.

- [ ] **Step 1: Add disconnect tests**

Assert:
- uninstall -> installation DISCONNECTED and all repositories DISCONNECTED;
- repository removal -> only that repository DISCONNECTED;
- setup POST after disconnect -> rejected before GitHub token minting;
- OIDC evaluation after disconnect -> rejected;
- `repository_evaluations` rows remain readable through authorized historical API response;
- no token table or token cleanup query exists because installation tokens were never persisted.

- [ ] **Step 2: Run tests and verify failures**

```bash
npm test -- tests/github-webhook.test.ts tests/github-api.test.ts
```

- [ ] **Step 3: Implement disconnect reconciliation**

Historical sanitized metadata remains. All future automation actions check ACTIVE connection state first.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- tests/github-webhook.test.ts tests/github-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/github-app-store.ts apps/api/src/github-app-routes.ts packages/github-app/src/webhook.ts tests/github-webhook.test.ts tests/github-api.test.ts
git commit -m "feat: fail safe when GitHub access is removed"
```

---

### Task 14: Security Documentation and GitHub App Registration Contract

**Files:**
- Create: `Docs/github-app.md`
- Modify: `Docs/security-model.md`
- Modify: `apps/api/src/config.ts`
- Test: `tests/github-app-domain.test.ts`

**Interfaces:**
- Produces: exact operator configuration contract for creating the GitHub App and deployment variables.

- [ ] **Step 1: Add config tests for all required deployment variables**

Required server-only variables:

```text
GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
LIMEN_GITHUB_OIDC_AUDIENCE=limen-api
LIMEN_ACTION_SHA
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Required public web variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_LIMEN_API_URL
NEXT_PUBLIC_GITHUB_APP_SLUG
```

Neither `LIMEN_TELEGRAPH_PRIVATE_KEY` nor a hardcoded `TELEGRAPH_ENGINE_URL` belongs in the Limen web/API deployment. The maintainer configures the private key as a GitHub Secret and the Engine URL as a GitHub repository Variable.

- [ ] **Step 2: Document exact GitHub App registration settings**

`Docs/github-app.md` must specify:
- public GitHub App when ready for external installation;
- repository permissions: Metadata read, Contents read/write, Pull Requests read/write, Workflows read/write;
- no Actions read permission;
- webhooks active;
- webhook events: installation, installation_repositories, pull_request;
- webhook URL: `${LIMEN_API_URL}/v1/github/webhooks`;
- setup URL: `${LIMEN_SITE_URL}/github/installed`;
- setup redirect `installation_id` is untrusted until backend verification;
- private key remains server-only;
- installation tokens are generated on demand and never persisted;
- Telegraph private key stays only in each adopter repository's GitHub Secret.

- [ ] **Step 3: Update security model**

Add threats/controls for:
- spoofed setup URL installation IDs;
- webhook forgery/replay;
- installation-token leakage;
- cross-repository authorization;
- OIDC claim spoofing/mismatch;
- workflow-file write permission;
- disconnect races;
- GitHub App private-key exposure.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/github-app-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Docs/github-app.md Docs/security-model.md apps/api/src/config.ts tests/github-app-domain.test.ts
git commit -m "docs: define GitHub App security contract"
```

---

### Task 15: P18 End-to-End Fixture Harness

**Files:**
- Create: `tests/github-app-e2e.test.ts`
- Modify: test helpers only where an existing shared test-helper pattern already exists.

**Interfaces:**
- Consumes: all P18 services using fake GitHub/Supabase/JWKS transports.
- Produces: one deterministic first-time-user journey with zero paid Telegraph calls.

- [ ] **Step 1: Write the complete fixture journey**

The test sequence is exactly:
1. authenticate GitHub user ID `101`;
2. receive signed `installation.created` for installation `201` and repository `301`;
3. bind installation as user `101`;
4. list repository -> `SETUP_REQUIRED`;
5. preview setup -> policy/workflow proposed;
6. create setup PR -> `SETUP_PR_OPEN`;
7. receive signed merged setup PR webhook -> `CONFIGURED`;
8. submit valid OIDC evaluation for repository `301`, run `401`, decision `REVIEW`;
9. repository -> `VERIFIED`, latest decision `REVIEW`;
10. receive repository-removal webhook;
11. repository -> `DISCONNECTED` while evaluation `401` remains in history.

The use of `REVIEW` in step 8 proves integration verification is separate from whether the release passed.

- [ ] **Step 2: Explicitly assert zero Telegraph client calls**

The fake Telegraph transport call count must remain `0` for this P18 plumbing E2E.

- [ ] **Step 3: Run test and fix only P18 integration defects**

```bash
npm test -- tests/github-app-e2e.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/github-app-e2e.test.ts
git commit -m "test: cover GitHub App onboarding lifecycle"
```

---

### Task 16: Full Verification and P18 Release Candidate

**Files:**
- Modify only files required by failing verification; no new features.

**Interfaces:**
- Produces: verified P18 release candidate ready for a controlled real GitHub App install test.

- [ ] **Step 1: Run complete automated verification**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

Expected:
- all tests pass;
- lint passes;
- typecheck passes;
- Next production build passes;
- audit reports no production vulnerabilities.

- [ ] **Step 2: Rebuild Action and confirm no uncommitted generated drift**

Run the repository's existing Action build command, then:

```bash
git status --short
git diff --check
```

Expected: no unexpected generated drift and no whitespace errors.

- [ ] **Step 3: Run targeted security regression suite**

```bash
npm test -- tests/github-webhook.test.ts tests/github-setup.test.ts tests/github-oidc.test.ts tests/github-api.test.ts tests/action-callback.test.ts tests/github-app-e2e.test.ts
```

Expected: PASS.

- [ ] **Step 4: Verify the hackathon tag still points to the exact submitted commit**

```bash
test "$(git rev-list -n 1 telegraph-track3-submission-2026-09-05)" = "6a763acf0f58c03f42b0d121103640691ff96825"
```

Expected: exit 0.

- [ ] **Step 5: Commit only verification-driven fixes if any exist**

If there are no changes, do not create an empty commit. If verification required a fix, commit it with a precise message naming the defect.

- [ ] **Step 6: Produce the P18 completion report**

Report:
- commits created;
- GitHub App permissions actually required;
- tables/migrations added;
- routes added;
- OIDC claims verified;
- onboarding lifecycle states;
- test/lint/typecheck/build/audit counts/results;
- confirmation that no paid Telegraph request was made for P18 plumbing;
- confirmation that `LIMEN_TELEGRAPH_PRIVATE_KEY` never entered Limen backend/web storage;
- confirmation that the hackathon tag remains exact;
- any manual GitHub/Supabase/Vercel configuration still required before the first real install.

Do not call P18 production-ready until the controlled real installation test succeeds in the next operational step.

---

## Post-Plan Operational Gate

After Task 16 passes locally, perform one controlled real installation using Limen's own demo/test repository before exposing the App broadly. That operational test must verify GitHub App registration, signed webhook delivery, setup PR creation, manual GitHub Secret addition, setup merge, one real Action evaluation, OIDC callback acceptance, `VERIFIED` state, and clean disconnect/reinstall behavior.

The controlled real Action evaluation may use the existing Telegraph testnet path only when the operator explicitly chooses to spend the test USDC; P18 code correctness itself must not depend on a paid call.

P19 Remediation Recommendation does not begin until P18's controlled installation path is proven.
