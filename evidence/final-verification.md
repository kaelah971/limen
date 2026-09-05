# Final P15B Verification

Verification date: 2026-09-05

These checks were run locally after the P15B documentation changes. They did not trigger a GitHub workflow, make a Telegraph request, spend funds, modify the demo repository, publish a receipt, or revoke a receipt.

## Results

| Command | Result |
|---|---|
| `npm test` | PASS - 14 test files passed, 255 tests passed |
| `npm run typecheck` | PASS - TypeScript completed with exit code 0 |
| `npm run lint` | PASS - ESLint completed with exit code 0 |
| `npm run build` | PASS - Next.js 16.3.4 production build completed; routes `/`, `/demo`, `/proof`, `/receipt/[id]`, and `/setup` generated |
| `npm run build:action` | PASS - `ncc` 0.45.0 produced `action/dist/index.js` and `action/dist/254.index.js` |
| `npm audit --omit=dev` | PASS - 0 vulnerabilities |

## Test Output

```text
Test Files  14 passed (14)
Tests       255 passed (255)
```

## Public Route Verification

Verified with HTTP requests before packaging:

| Surface | Result |
|---|---:|
| `https://limen-mu.vercel.app` | `200` |
| `https://limen-mu.vercel.app/demo` | `200` |
| `https://limen-mu.vercel.app/setup` | `200` |
| `https://limen-mu.vercel.app/proof` | `200` |
| Active receipt page | `200` |
| Active receipt API | `200` |
| Revoked receipt API | `410` |
| Unknown receipt API | `404` |
| Unauthenticated private ledger API | `401` |
| HOLD run, PASS run, Demo PR, Limen repo, demo repo | `200` |

The active receipt payload identifies `overallDecision=HOLD`, five Telegraph requests, known cost `$0.05`, and `usageClass=demo`. The fresh Judge Mode run links remain separate from this historical receipt chain.
