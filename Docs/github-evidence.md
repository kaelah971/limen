# GitHub Evidence Adapter

`packages/github` provides read-only GitHub REST access and normalizes repository-specific dependency evidence. It is an evidence source, not a decision engine. Callers must pass any returned `RepositoryExposureEvidence` and explicit Telegraph state to the pure core evaluator.

## Endpoints

The adapter uses API version `2026-03-10` and sends `Accept: application/vnd.github+json`.

- Dependency Review: `GET /repos/{owner}/{repo}/dependency-graph/compare/{base}...{head}`
- Global Advisory: `GET /advisories/{ghsa_id}`
- Dependabot alerts: `GET /repos/{owner}/{repo}/dependabot/alerts?per_page=100`

All requests are `GET` requests. Dependency Review requires a base and head revision. Full 40-character SHAs are accepted; abbreviated SHA-like values are rejected unless explicitly declared as refs. The client returns safe status, rate-limit, reset, and request-ID metadata.

## Evidence Sources

Dependency Review is PR-specific. Added and changed vulnerable dependencies produce `affected` candidates. Removed dependencies and changes without vulnerabilities produce no candidate. Snapshot warnings fail closed with `GITHUB_DEPENDENCY_SNAPSHOT_WARNING` because the diff is not authoritative.

Global Advisory enriches a Dependency Review GHSA with CVE identity, severity, CVSS, references, and vulnerable version metadata. Advisory vulnerability ranges are used only when exactly one vulnerability matches the normalized ecosystem and exact package name. Multiple matches leave range and first-patched version as `null`.

Dependabot alerts describe repository/default-branch state and are not PR-head evidence. Open alerts produce `affected` candidates. Dismissed, auto-dismissed, and fixed alerts produce inactive candidates with no final repository evidence.

## Uncertainty Rules

- Missing CVE identity produces a `missing-cve` candidate and no final `RepositoryExposureEvidence`.
- Missing installed version, vulnerable range, first-patched version, scope, or relationship remains `null` or `unknown`; values are not inferred.
- A package identity mismatch between source objects throws `GITHUB_EVIDENCE_CONFLICT`.
- Conflicting known severity values throw `GITHUB_EVIDENCE_CONFLICT`.
- A final repository evidence object is emitted only for active candidates with a valid normalized CVE ID.

## Configuration

The adapter reads optional `GITHUB_TOKEN`, `GITHUB_API_URL`, `GITHUB_API_VERSION`, and `GITHUB_TIMEOUT_MS` values through `loadGitHubConfig`. The public GitHub API works without a token for endpoints permitted by GitHub. Tokens are never copied into evidence, metadata, logs, or typed error details.

## Error Handling

The client distinguishes configuration, API transport, authentication, permission, rate-limit, advisory-not-found, malformed response, and snapshot-warning failures. Normalization additionally reports package identity, CVE identity, and severity conflicts. These errors are inputs for later orchestration; this package does not map them directly to `PASS`, `HOLD`, or `REVIEW`.
