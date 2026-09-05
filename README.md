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
      - uses: kaelah971/limen@8688a0ec967e6e2bbc10d1464456acedc96cfe6b
        with:
          github-token: ${{ github.token }}
          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}
```

Use the current immutable Action reference `kaelah971/limen@8688a0ec967e6e2bbc10d1464456acedc96cfe6b`. Set the `TELEGRAPH_ENGINE_URL` GitHub Variable to `http://13.237.89.59:7044/engine/v1/ask` for the currently validated Telegraph testnet Engine route. This endpoint is current setup infrastructure, not permanent production infrastructure.

See [`Docs/github-action.md`](Docs/github-action.md) for installation, inputs, outputs, fork behavior, and the supported `pull_request` contract. A complete workflow is at [`examples/github-actions/limen.yml`](examples/github-actions/limen.yml). The public onboarding page is available at `/setup`.

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

The bundled Action entrypoint is `action/dist/index.js` and is declared by `action.yml`. Optional P5 evidence persistence remains a separate server-side ledger path, and P6 receipt publication is not automatic from the Action. Limen has no authentication, billing, GitHub App installation, or custom Checks API integration.
