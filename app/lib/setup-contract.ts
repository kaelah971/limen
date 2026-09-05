export const CURRENT_ACTION_REFERENCE =
  "kaelah971/limen@a91d36bfe8eaab5d95f791e39449878239bf948d";

export const CURRENT_TELEGRAPH_ENGINE_URL =
  "http://13.237.89.59:7044/engine/v1/ask";

export const CURRENT_TELEGRAPH_NETWORK = "eip155:84532";

export const CURRENT_WORKFLOW = `name: Limen

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened

permissions:
  contents: read

jobs:
  limen:
    runs-on: ubuntu-latest
    steps:
      - name: Evaluate release evidence
        uses: ${CURRENT_ACTION_REFERENCE}
        with:
          github-token: \${{ github.token }}
          telegraph-private-key: \${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}
          telegraph-engine-url: \${{ vars.TELEGRAPH_ENGINE_URL }}`;

export const RECOMMENDED_POLICY = `production:
  block_severity:
    - critical
    - high

  dependency_scopes:
    - runtime

  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review`;

export const MINIMAL_POLICY = `production:
  block_severity:
    - high
  dependency_scopes:
    - runtime`;
