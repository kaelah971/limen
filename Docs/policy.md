# Limen Policy System

P2 loads one small repository policy from the repository root, normalizes it into the existing P1 `LimenPolicy`, gives the effective content a deterministic version, and passes that object to `evaluateLimenDecision`.

## File And Location

The canonical filename is `limen.yml` at the repository root. `limen.yaml` is supported as a fallback only when `limen.yml` does not exist. If both files exist, `limen.yml` wins. An explicit `filePath` may be supplied to `loadLimenPolicy` for tests or future integrations.

```typescript
const loaded = await loadLimenPolicy({
  cwd: repositoryRoot,
});

loaded.policy;
loaded.source;
```

`loaded.source.path` is the resolved file path and `loaded.source.format` is `yaml`. Filesystem metadata stays outside the pure decision policy.

## Public Format

The supported external shape uses snake_case keys:

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

`production` is required. P2 intentionally supports no additional environments, rules, expressions, includes, commands, hooks, or scripts.

## Safe Defaults

The four uncertainty settings default to `review` when omitted:

```yaml
production:
  block_severity: [critical, high]
  dependency_scopes: [runtime]
```

This is equivalent to explicitly setting all four uncertainty fields to `review`. `unknownExposure` is an internal P1 safety setting and is also fixed to `review` during normalization.

The risk appetite fields do not default:

- `block_severity` is required and must contain at least one value.
- `dependency_scopes` is required and must contain at least one value.

An absent policy file is an error. It never creates an empty policy or a `PASS` result.

## Validation And Normalization

Severity values accept only `low`, `medium`, `high`, and `critical`, case-insensitively. They normalize to uppercase and use this canonical set order: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`. `unknown`, malformed values, empty values, and duplicates after normalization are rejected.

Dependency scopes accept `runtime` and `development`, case-insensitively, and normalize to lowercase. `unknown`, malformed values, empty values, and duplicates after normalization are rejected. Unknown repository scope remains a P1 uncertainty state and cannot be trusted by policy.

Uncertainty fields accept exactly `review`. `pass`, `ignore`, `allow`, and `hold` are rejected in P2 so a configuration cannot weaken the MVP safety model.

The document and `production` object are strict. Unknown keys, missing `production`, wrong scalar/list types, empty risk arrays, and executable or unsupported YAML values are rejected. Duplicate YAML keys are rejected by the parser. The parser uses YAML core semantics, does not register custom tags, and does not expand environment variables or shell expressions.

## Policy Versioning

P2 canonicalizes the validated internal policy content before hashing. The generated `version` field is excluded from the hashed content, preventing circular versioning. Canonicalization fixes object key order, severity order, scope order, casing, and defaulted uncertainty values. SHA-256 is truncated to 12 hexadecimal characters and prefixed with `LP-`.

Equivalent effective policies have the same version:

```text
block_severity: [high, critical]
block_severity: [CRITICAL, HIGH]
```

Comments, whitespace, YAML key order, and omitted versus explicit `review` fields also do not change the version. Changing a blocking severity or dependency scope changes the version. The version identifies effective policy content, not source formatting, file timestamps, random values, or runtime time.

## Errors

Policy failures use the existing redacted `LimenError` serialization:

- `LIMEN_POLICY_NOT_FOUND` — no root `limen.yml` or fallback `limen.yaml` exists.
- `LIMEN_POLICY_READ_ERROR` — the selected file cannot be read.
- `LIMEN_POLICY_PARSE_ERROR` — YAML syntax or unsupported document parsing failed.
- `LIMEN_POLICY_DUPLICATE_KEY` — YAML contains an ambiguous duplicate key.
- `LIMEN_POLICY_VALIDATION_ERROR` — the parsed document violates the supported external schema.

Validation messages include the external path, for example:

```text
Invalid Limen policy: production.block_severity[0] must be one of low, medium, high, critical.
```

## P1 Integration

`parseLimenPolicy(yamlString)` returns the existing normalized `LimenPolicy` directly. `loadLimenPolicy({ cwd, filePath? })` reads one file, parses it through the same path, and returns `{ policy, source }`. Consumers pass only `loaded.policy` to P1:

```typescript
const loaded = await loadLimenPolicy({ cwd: repositoryRoot });
const result = evaluateLimenDecision({
  id,
  evaluatedAt,
  repositoryEvidence,
  telegraphEvidence,
  policy: loaded.policy,
});
```

P1 remains pure and does not know whether its policy came from YAML, a test fixture, or a future integration. A Telegraph failure remains an explicit P1 input state, and the same canonical `LimenDecisionResult` is returned.

## Example

The developer example is available at `examples/limen.yml`. It contains policy only. Telegraph credentials and infrastructure configuration belong in environment configuration, never in `limen.yml`.
