# Limen GitHub Action

Limen is a release-evidence gate for dependency-sensitive pull requests. The Action reads GitHub API data, retrieves the policy from the pull request base commit, requests routed Telegraph evidence only when a relevant CVE exists, evaluates the existing P1 decision engine, and fails or passes the workflow according to the result.

It does not checkout the pull request, install dependencies, run repository scripts, create custom Check Runs, or execute target-repository code. Optional evidence persistence is performed by a separate server-side ledger API; the Action never receives a Supabase service-role key.

## Installation

Add a root `limen.yml` policy to the repository's trusted default branch. Then add the workflow from `examples/github-actions/limen.yml` using the current immutable Limen commit `kaelah971/limen@8688a0ec967e6e2bbc10d1464456acedc96cfe6b`. No current Limen tag, release, or Marketplace flow exists.

The workflow needs only:

```yaml
permissions:
  contents: read
```

The workflow job itself is the mergeable check. Limen does not request `checks: write`, `pull-requests: write`, or `contents: write`.

## Safe Workflow

```yaml
name: Limen

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

jobs:
  limen:
    runs-on: ubuntu-latest
    steps:
      - name: Evaluate release evidence
        uses: kaelah971/limen@8688a0ec967e6e2bbc10d1464456acedc96cfe6b
        with:
          github-token: ${{ github.token }}
          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}
```

There is deliberately no checkout step. Set the GitHub Variable `TELEGRAPH_ENGINE_URL` to `http://13.237.89.59:7044/engine/v1/ask` for the currently validated Telegraph testnet Engine route. This endpoint is current setup infrastructure, not permanent production infrastructure. `telegraph-engine-url` may instead be provided through the existing `TELEGRAPH_ENGINE_URL` environment configuration. The Action uses Base Sepolia (`eip155:84532`) by default through `expected-network` and the existing Telegraph configuration path.

## Inputs

| Input | Required | Description |
|---|---:|---|
| `github-token` | Yes | Read-only GitHub token, normally `${{ github.token }}`. |
| `telegraph-private-key` | No | EVM signing key. It is needed only when a paid CVE lookup is required. |
| `max-lookups` | No | Unique paid CVE lookups, bounded from `1` to `20`; default `5`. |
| `telegraph-engine-url` | No | Telegraph Engine `/v1/ask` URL; falls back to `TELEGRAPH_ENGINE_URL`. |
| `expected-network` | No | x402 network; falls back to `TELEGRAPH_EXPECTED_NETWORK` or Base Sepolia. |
| `ledger-url` | No | Optional Limen Evidence Ledger `/v1/ledger/runs` URL; falls back to `LIMEN_LEDGER_URL`. |
| `ledger-token` | No | Optional machine-to-machine ledger token; falls back to `LIMEN_LEDGER_TOKEN`. |
| `usage-class` | No | `production`, `demo`, `development`, or `test`; defaults to `production`. |

The Action immediately masks the GitHub token and Telegraph private key when read. Neither is included in outputs, summaries, annotations, or error details.

## Outputs

The Action exposes `decision`, `run-id`, `policy-version`, `decision-count`, `pass-count`, `hold-count`, `review-count`, `evaluated-cves`, `skipped-cves`, `telegraph-request-count`, `telegraph-cost-usd`, `reason`, `ledger-run-id`, and `ledger-persisted`. CVE list outputs are JSON arrays. Outputs contain no raw GitHub response, payment proof, signature, token, or private key.

## Policy Trust

For a pull request, the base commit is the policy authority and the head commit is the proposed dependency state:

```text
base SHA -> limen.yml / limen.yaml -> P2 parser -> LimenPolicy
head SHA -> Dependency Review -> RepositoryExposureEvidence
```

The Action never loads `limen.yml` from the pull request head. If the PR changes `limen.yml`, that proposed policy does not govern its own check. A merged policy change can govern subsequent pull requests. `limen.yml` wins over `limen.yaml`; the fallback is retrieved from the same trusted base SHA.

## Decision Behavior

- `PASS`: the workflow succeeds. Available evidence supports proceeding under policy.
- `HOLD`: the workflow fails. Evidence is sufficient and policy says stop.
- `REVIEW`: the workflow fails closed. Evidence is missing, conflicting, unavailable, or the lookup budget was exceeded.

No relevant introduced vulnerability produces `PASS`, zero paid requests, and the reason `NO_RELEVANT_VULNERABILITY`. This does not claim that the repository is secure.

## Evidence Flow

1. Validate the `pull_request` or `pull_request_target` event and full base/head SHAs.
2. Retrieve and parse trusted base policy through the GitHub Contents API.
3. Compare `baseSha...headSha` through the P4 Dependency Review client.
4. Retry dependency snapshot warnings at most twice after the initial attempt, with deterministic short backoff. Exhaustion produces `REVIEW`.
5. Ignore removed and non-vulnerable changes. Normalize only active affected findings.
6. Enrich GHSA findings with Global Advisory data and require a real CVE before routed lookup.
7. Deduplicate CVEs in memory, sort by repository severity descending then CVE ID ascending, and process at most `max-lookups`.
8. Call the existing Telegraph `lookupCve()` production client. It performs the real Engine, HTTP 402, x402 payment, `PAYMENT-SIGNATURE` retry, and `CVE_LOOKUP` verification flow.
9. Evaluate every selected repository evidence pair with the existing pure P1 evaluator.
10. Aggregate canonical decisions with `HOLD > REVIEW > PASS`.
11. If both optional ledger settings are present, send one sanitized `LedgerRunIngest` package to the server-side ledger API after evaluation.

Duplicate CVEs share one paid Telegraph request while each repository evidence record still receives its own canonical P1 decision. Budget overflow can never produce `PASS`. A Telegraph failure becomes a failed P1 evidence input and therefore `REVIEW`.

## Summary And Annotations

The Action writes a `GITHUB_STEP_SUMMARY` containing repository, PR, policy version, base/head SHAs, evidence rows, Telegraph provenance where available, reason codes, cost, latency, and next action. Raw API responses are never dumped.

- `PASS` uses a notice and exits successfully.
- `HOLD` uses an error annotation and fails the workflow.
- `REVIEW` uses a warning annotation followed by a failed workflow step.

`HOLD` means “evidence is sufficient; policy says stop.” `REVIEW` means “evidence is insufficient or unavailable; human investigation is required.” Both are intentionally non-green workflow outcomes.

When persistence is enabled, the summary reports `Evidence ledger: recorded` and a stable `LM-RUN-...` ID. Without configuration it reports `Evidence ledger: not configured`; an unavailable API reports `Evidence ledger: persistence failed`. Ledger persistence is non-fatal and never changes the release decision or Action exit behavior.

## Forks And Dependabot

Normal `pull_request` workflows from forks do not receive repository secrets. A relevant fork PR without `LIMEN_TELEGRAPH_PRIVATE_KEY` cannot make a paid lookup and will return `REVIEW`; a PR with no relevant CVE can still pass without the key. Dependabot-style PRs have the same secret limitation in normal pull request workflows.

Do not weaken this behavior by treating a missing payment key as `PASS`. Use a trusted maintainer workflow or an explicit protected environment if automatic paid evaluation is required.

## `pull_request_target` Warning

`pull_request_target` is privileged. Never checkout or execute untrusted pull-request head code in the same privileged job that has access to Limen's Telegraph payment credential. Limen's Action itself uses only event metadata and GitHub REST APIs, but surrounding workflow steps must preserve that boundary.

If maintainers intentionally use `pull_request_target` for trusted automated PRs such as Dependabot, restrict automatic execution to trusted actors such as `OWNER`, `MEMBER`, `COLLABORATOR`, or `dependabot[bot]`, or require a protected GitHub Environment/manual approval for external contributors. Keep `contents: read`, load policy from the base SHA, do not interpolate PR-controlled strings into shell, and never add a checkout or install step.

A hardened advanced workflow can gate the privileged event before the Action receives secrets:

```yaml
name: Limen trusted PR check

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

jobs:
  limen:
    if: >-
      github.actor == 'dependabot[bot]' ||
      github.event.pull_request.author_association == 'OWNER' ||
      github.event.pull_request.author_association == 'MEMBER' ||
      github.event.pull_request.author_association == 'COLLABORATOR'
    runs-on: ubuntu-latest
    environment: limen-paid
    steps:
      - uses: kaelah971/limen@8688a0ec967e6e2bbc10d1464456acedc96cfe6b
        with:
          github-token: ${{ github.token }}
          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}
```

The environment should require maintainer approval when the repository's trust model does not permit automatic spending. This workflow still contains no checkout and no target-code execution.

## Build And Scope

The Action is bundled with:

```text
npm run build:action
```

This generates `action/dist/index.js`, the entrypoint declared in `action.yml`. Consumers do not run `npm install` or build the Action inside their repositories. P3 does not include public receipts, the web app, user authentication, billing, GitHub App installation, custom Checks API calls, or Judge Mode. P5's optional persistence remains a separate backend service, and P6 receipt publication is not automatic from the Action.
