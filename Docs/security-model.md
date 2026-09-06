# Limen Security Model

P0 protects the external payment/evidence boundary. P1 keeps the decision evaluator pure. P2 treats repository policy as untrusted configuration. P4 adds read-only GitHub ingestion. P3 orchestrates those boundaries in a bundled Action. P5 adds optional server-owned persistence without moving credentials into the Action or changing release-decision semantics.

## Secrets

`TELEGRAPH_PRIVATE_KEY` is loaded from the environment and used to construct an in-memory viem account. The key is not written to files, logs, normalized evidence, or error details. Payment signatures and reusable payment proof are never returned by the public Limen contracts.

The redactor removes private keys, seed material, payment signatures, payment proofs, authorization credentials, and token-like secret fields recursively. It preserves safe audit fields such as `miner_id`, `miner_name`, `CVE_LOOKUP`, cost, duration, network, scheme, and timestamps.

`GITHUB_TOKEN` is optional and is used only for GitHub request authorization. It is not included in normalized evidence, request metadata, typed error details, or response-shape diagnostics. GitHub API error bodies are reduced to safe status/body-type metadata rather than copied into errors.

## Network Safety

The expected network defaults to Base Sepolia (`eip155:84532`). Current Judge Mode accepts only the validated Base Sepolia USDC asset (`0x036CbD53842c5426634e7929541eC2318f3DCf7e`), an exact scheme, a structurally valid non-zero EVM `payTo`, amounts from `1` through `50000` base units, and timeouts from `1` through `120` seconds. A run authorizes at most `250000` base units. These checks happen before x402 payment proof construction; a rejected challenge produces no paid request.

The current Telegraph Engine origin is exactly `http://13.237.89.59:7044/engine/v1/ask`, the explicit HTTP testnet exception. Arbitrary HTTP Engine URLs, private/metadata destinations, and redirects are rejected. Payment recipient identity remains Engine-controlled rather than hardcoded, but is structurally validated.

## External Data

Telegraph responses are treated as untrusted `unknown` data and normalized defensively. Missing optional fields remain visible as `null` or `[]`. Malformed response shapes, unexpected Intents, transport failures, challenge failures, payment failures, and response failures use classified errors. No external `200` status is interpreted as a Limen decision.

GitHub responses are also untrusted. Zod schemas validate Dependency Review, Global Advisory, and Dependabot shapes before normalization. HTTP `401`, permission `403`, rate-limit `403/429`, missing advisories, malformed bodies, snapshot warnings, package identity conflicts, severity conflicts, and ambiguous evidence use distinct typed errors or explicit uncertainty. The adapter never infers a CVE, installed version, fix, scope, relationship, or authoritative clean result from missing data.

GitHub requests are restricted to `GET` operations and the authoritative origin is exactly `https://api.github.com`; arbitrary runtime API origins are rejected. Repository owner, name, GHSA identifiers, and revision values are validated or encoded before URL construction. Timeouts use an abort signal, redirects are rejected, and rate-limit remaining/reset values plus GitHub request IDs are retained as non-secret metadata.

## Action Threat Boundary

The P3 Action never checks out, installs, builds, or executes the target pull request. It uses event metadata and GitHub REST APIs, which prevents PR-controlled code or package scripts from running in a job that may hold `TELEGRAPH_PRIVATE_KEY`. Policy is retrieved from the trusted base SHA, not the proposed head SHA.

The Action requires only `contents: read` in its reference workflow and does not call the Checks API. `HOLD` and `REVIEW` fail the workflow step so branch protection can enforce the result without granting write permissions. Paid Telegraph configuration is lazy: no relevant CVE means no wallet initialization and no payment credential requirement.

The Action accepts only `pull_request`. It rejects `pull_request_target` rather than presenting a privileged workflow composition as a supported contract. The Action masks credentials immediately, emits only safe outputs and summaries, and maps expected Telegraph failures to P1 `REVIEW`.

## Policy Configuration

`limen.yml` is parsed with a mature YAML library using core schema semantics and duplicate-key rejection. P2 permits only the bounded snake_case policy shape, rejects unknown keys and unsupported values, does not execute tags or expand environment values, and requires explicit risk appetite fields. Uncertainty settings safely default to `review`. Policy versions hash canonical effective content rather than source formatting.

## Evidence Ledger Boundary

P5 persistence is server-only. `SUPABASE_SERVICE_ROLE_KEY` is read only by `apps/api/src/supabase.ts` and is never part of the Action inputs, Action bundle, browser code, ledger payload, or API response. The backend accepts only an `Authorization: Bearer` machine-to-machine ingest token from `LIMEN_INGEST_TOKEN`; the consuming Action owns the separate `LIMEN_LEDGER_TOKEN` value. Both authenticated writes and reads are handled by the backend, while RLS is enabled and no anonymous policies are created.

The ingest validator rejects prohibited fields recursively, including private keys, seeds, mnemonics, payment signatures/proofs, authorization headers, GitHub tokens, generic tokens and service-role key variants. It also redacts sensitive assignment/header strings before normalized JSON is passed to the database function. The schema contains no credential or raw reusable payment-proof columns.

The Postgres `persist_limen_run` function is `security definer` with a fixed `search_path`, performs the parent and child inserts in one transaction, and exposes execution only to `service_role`. Unique GitHub run/attempt, decision, and run/CVE request keys prevent duplicate evidence on retries. Conflicting idempotency payloads are rejected rather than overwritten.

Ledger outage is not release evidence. The Action calculates the canonical result before attempting persistence and emits a safe warning when the ledger is absent or unavailable. The original `PASS`, `HOLD`, or `REVIEW` and its workflow exit behavior remain unchanged.

The shared ledger token is suitable only for the current controlled single-operator deployment. It is not multi-tenant authorization. Remote ledger URLs require HTTPS, localhost is the only HTTP development exception, private and metadata destinations are rejected, and authenticated requests reject redirects. Supabase configuration follows the same URL policy; the Supabase SDK owns its transport, so no separate redirect override is claimed here.

Public receipts contain a tamper-evident SHA-256 snapshot hash. The hash is an integrity check, not a digital signature, publisher authentication, or non-repudiation mechanism.

The web app sends basic security headers including `nosniff`, strict-origin referrer policy, `frame-ancestors 'none'`, and a conservative same-origin Content Security Policy. Cheap policy and provider response size bounds are enforced. Cross-run spending budgets, tenant authorization, full rate limiting/DoS controls, signed receipts, and enterprise SIEM/WAF/HSM controls remain post-hackathon risks.

## GitHub App Boundary

The P18 GitHub App is an identity and setup boundary, not the release-decision engine. The App handles installation metadata, repository selection, verified webhooks, short-lived installation clients, and setup pull requests. The existing GitHub Action remains responsible for repository evidence, Telegraph lookups, policy evaluation, and the canonical `PASS`, `HOLD`, or `REVIEW` result.

The setup redirect may contain an `installation_id`, but that identifier is untrusted input and never authorizes a user. Binding requires a verified active installation from signed webhook state, an authenticated Limen user, and a matching `installed_by_github_user_id`. Repository APIs authorize through that durable installation binding, preventing cross-repository and cross-installation access.

Webhook requests are verified over the raw body with `X-Hub-Signature-256` before JSON parsing. The handler requires GitHub delivery and event headers and deduplicates durable delivery IDs before state mutation. Invalid signatures are rejected, duplicate deliveries are safe no-ops, and uninstall or repository-removal events immediately mark affected records `DISCONNECTED`.

GitHub App JWTs and installation access tokens are server-only, short-lived, and held only for the operation that needs them. They are never stored in Supabase, cookies, logs, response objects, or browser bundles. The App private key and webhook secret are loaded only from server deployment variables and are never included in validation errors or public diagnostics.

Setup writes are limited to an isolated branch and pull request. Limen never commits directly to the default branch, never overwrites existing setup files, and requests `Workflows: write` only because the setup PR creates `.github/workflows/limen.yml`. The App does not receive repository secrets; `LIMEN_TELEGRAPH_PRIVATE_KEY` remains an adopter-owned GitHub Actions Secret, and `TELEGRAPH_ENGINE_URL` remains an adopter-owned repository Variable.

GitHub Actions OIDC callbacks require the exact GitHub issuer, configured `limen-api` audience, repository and repository ID, workflow reference, run identity, active connected repository, and matching request body. Mismatched or spoofed claims are rejected. Disconnect checks run before setup, integration-health, and evaluation operations so stale callbacks cannot reactivate or mutate disconnected repositories. Accepted sanitized evaluation history remains available for authorized audit views.

The canonical deployment names are `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `LIMEN_GITHUB_OIDC_AUDIENCE`, `LIMEN_ACTION_SHA`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LIMEN_PUBLIC_API_URL` on the server side. Public web configuration uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_GITHUB_APP_SLUG`. Legacy aliases such as `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_LIMEN_API_URL` are not part of the contract. The Limen web/API deployment contains neither the Telegraph private key nor an adopter-specific `TELEGRAPH_ENGINE_URL`; the generated P18 workflow must use the adopter's GitHub repository Variable.

## Future Controls

P1, P3, and P5 ensure that repository policy, identity conflicts, severity conflicts, missing evidence, bounded lookup budgets, external failures, and persistence failure remain explicit and deterministic. Later GitHub App and public receipt milestones may add stronger request authenticity, tenant isolation, retention controls, and access policy without weakening the current server-only boundary.
