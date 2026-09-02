# Limen

Limen is a release-evidence gate for dependency-sensitive pull requests. It combines repository exposure facts with routed Telegraph `CVE_LOOKUP` evidence, applies the trusted repository policy, and returns an explicit `PASS`, `HOLD`, or `REVIEW` decision.

## Use The Action

Limen uses GitHub APIs and does not require a checkout of the pull request:

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
      - uses: <owner>/limen@<PINNED_REF>
        with:
          github-token: ${{ github.token }}
          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}
```

See [`Docs/github-action.md`](Docs/github-action.md) for installation, inputs, outputs, fork behavior, and hardened `pull_request_target` guidance. A complete placeholder workflow is at [`examples/github-actions/limen.yml`](examples/github-actions/limen.yml).

## Policy

Commit a root `limen.yml` to the trusted base branch:

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

For a pull request, Limen reads this file at the base SHA, never from the PR head. A PR cannot weaken the policy it is being evaluated against.

## Decisions

- `PASS`: available evidence supports proceeding under policy; the workflow succeeds.
- `HOLD`: evidence is sufficient and policy blocks the release; the workflow fails.
- `REVIEW`: evidence is missing, conflicting, unavailable, or unevaluated due to the lookup budget; the workflow fails closed.

Limen does not claim that `PASS` proves a repository is secure. It is a release permission boundary, not a vulnerability oracle or replacement for Dependabot.

## Development

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run build:action
```

The bundled Action entrypoint is `action/dist/index.js` and is declared by `action.yml`. P3 intentionally adds no persistence, evidence receipts, web UI, authentication, billing, GitHub App installation, or custom Checks API integration.
