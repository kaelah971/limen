# Limen GitHub App

This document is the operator contract for registering and deploying the P18 Limen GitHub App. P18 uses the App for installation identity, repository selection, webhooks, and setup pull requests. The existing GitHub Action remains the release-evidence evaluator and is responsible for `PASS`, `HOLD`, and `REVIEW`.

## Registration Settings

Create the App as a private App for controlled development. Make it public only when the controlled real-installation test has passed and external installation is intended.

Use these settings when registering the App:

| Setting | Value |
| --- | --- |
| Homepage URL | The deployed `LIMEN_SITE_URL` |
| Setup URL | `${LIMEN_SITE_URL}/install` |
| Webhook active | Enabled |
| Webhook URL | `${LIMEN_PUBLIC_API_URL}/v1/github/webhooks` |
| Webhook content type | `application/json` |
| Webhook secret | A random value of at least 32 characters, stored as `GITHUB_WEBHOOK_SECRET` |

The setup URL is the existing Limen `/install` page. GitHub may append `installation_id` when returning from installation. That value is untrusted input; it becomes usable only after the backend confirms an active installation created by a verified GitHub webhook and binds it to the authenticated Limen user.

Request exactly these repository permissions:

| Permission | Access |
| --- | --- |
| Metadata | Read-only |
| Contents | Read and write |
| Pull requests | Read and write |
| Workflows | Read and write |

`Workflows: write` is required only because the setup pull request creates `.github/workflows/limen.yml`. Do not request `Actions: read`, administration, secrets, deployments, issues, or unrelated permissions.

Enable only these webhook events:

- `installation`
- `installation_repositories`
- `pull_request`

The webhook handler verifies the raw request body with `X-Hub-Signature-256`, requires `X-GitHub-Delivery` and `X-GitHub-Event`, and deduplicates delivery IDs before mutating installation state.

## Deployment Variables

### Server-only API and web runtime

Set these values in the server-side deployment environment. Do not expose them through `NEXT_PUBLIC_*`, Action inputs, repository variables, database rows, cookies, response bodies, or logs.

| Variable | Contract |
| --- | --- |
| `GITHUB_APP_ID` | Required positive integer App ID |
| `GITHUB_APP_SLUG` | Required GitHub App slug |
| `GITHUB_APP_PRIVATE_KEY` | Required PEM private key; escaped `\n` values are normalized at load time |
| `GITHUB_WEBHOOK_SECRET` | Required secret with at least 32 characters |
| `LIMEN_GITHUB_OIDC_AUDIENCE` | Set to `limen-api`; the current loader uses `limen-api` when omitted |
| `LIMEN_ACTION_SHA` | Required immutable 40-character hexadecimal commit SHA for the generated workflow |
| `SUPABASE_URL` | Required HTTPS Supabase URL; HTTP is allowed only for explicit localhost development |
| `SUPABASE_SERVICE_ROLE_KEY` | Required server-only Supabase service-role key |
| `LIMEN_PUBLIC_API_URL` | Required public API base URL; HTTPS in deployed environments, localhost HTTP only for development |

The API deployment also uses the existing ledger variables `LIMEN_INGEST_TOKEN`, `LIMEN_API_HOST`, and `LIMEN_API_PORT`. Keep `LIMEN_INGEST_TOKEN` separate from the GitHub App webhook secret and from the Action-side `LIMEN_LEDGER_TOKEN`.

`loadGitHubAppDeploymentConfig()` validates the GitHub App values, the Supabase service-role boundary, and the public API URL without logging secret values. The GitHub package loader separately normalizes the PEM key and validates the App ID, slug, webhook secret, OIDC audience, and Action SHA.

### Public web runtime

These values are safe for the browser bundle and are required by the current Next.js app:

| Variable | Contract |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable browser key |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | Public App slug used to build the GitHub installation URL |
| `LIMEN_SITE_URL` | Public site URL used for canonical/social metadata and App registration |

The current app does not use `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_LIMEN_API_URL`. Do not add aliases for those names. The browser receives no GitHub App private key, webhook secret, service-role key, installation token, OIDC verifier secret, ingest token, ledger token, or Telegraph private key.

### Adopter repository configuration

Each adopter configures the following in GitHub, not in Limen:

- GitHub Actions Secret: `LIMEN_TELEGRAPH_PRIVATE_KEY`.
- GitHub repository Variable: `TELEGRAPH_ENGINE_URL`.

The generated workflow references `${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}` and `${{ vars.TELEGRAPH_ENGINE_URL }}`. Limen never asks for, receives, proxies, stores, or logs the Telegraph private key. Do not add the adopter's `TELEGRAPH_ENGINE_URL` as a Limen web/API deployment setting or hardcode it into the generated P18 workflow.

The generated workflow requests only `contents: read` and `id-token: write`. The Action sends its completed evaluation to `${LIMEN_PUBLIC_API_URL}/v1/github/evaluations` when the callback URL is configured and authenticates that request with a short-lived GitHub Actions OIDC token.

## Runtime Security Contract

- GitHub App JWTs and installation access tokens exist only in server memory for the operation that needs them. Installation tokens are never persisted in Supabase, cookies, logs, or API responses.
- Webhook signatures are checked against the raw request bytes before JSON processing. Duplicate delivery IDs are safe no-ops.
- A setup redirect `installation_id` is not authorization. The backend requires an authenticated Limen user, verified installation webhook state, an active installation, and a matching GitHub installer identity before binding or repository access.
- Repository APIs authorize through the durable user-to-installation binding. A user cannot use a repository ID from another installation.
- Setup writes create an isolated branch and pull request. Limen never commits setup files directly to the default branch and never overwrites an existing `limen.yml`, `limen.yaml`, or Limen workflow.
- OIDC callbacks require the GitHub issuer, configured audience, repository identity, repository ID, workflow reference, run identity, active connected repository, and matching request body. Duplicate run/attempt records are idempotent; conflicting records are rejected.
- Installation deletion and repository removal become `DISCONNECTED`. Setup, health, and OIDC operations check connection state before acting, so stale callbacks and disconnect races cannot create new automation. Sanitized evaluation history remains available for authorized audit views.
- `NEEDS_ATTENTION` describes an unhealthy Limen integration. `REVIEW` remains a release decision for uncertain, conflicting, malformed, unavailable, or failed evaluation evidence.
- No GitHub App permission grants Limen access to repository secrets. The adopter-owned Telegraph secret remains inside GitHub Actions.

## Rotation and Incident Response

If the App private key or webhook secret is exposed, rotate it in GitHub first, update the matching server-only deployment variable, redeploy, and verify signed webhook delivery before reconnecting repositories. Do not paste either value into an issue, pull request, Limen form, repository variable, or browser-visible configuration.

If an installation is removed, treat the installation and its repositories as `DISCONNECTED`. Do not manually restore `VERIFIED` or reuse an old installation token. Reinstall through GitHub and complete the verified binding flow again.

## Readiness Boundary

This document defines configuration and security behavior; it does not claim that an external GitHub App has been registered or that a hosted Supabase/Vercel deployment has been exercised. Before broad release, complete the separate controlled installation test covering signed webhooks, setup PR creation, manual GitHub secret configuration, setup merge, one real Action evaluation, OIDC callback acceptance, `VERIFIED`, disconnect, and reinstall.
