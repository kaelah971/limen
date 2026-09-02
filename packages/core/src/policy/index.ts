import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  LimenPolicyDuplicateKeyError,
  LimenPolicyNotFoundError,
  LimenPolicyParseError,
  LimenPolicyReadError,
  LimenPolicyValidationError,
} from "../errors/errors";
import {
  normalizeSeverity,
  type DependencyScope,
  type LimenPolicy,
  type Severity,
} from "../domain/types";
import { validateLimenPolicy } from "../decision/evaluate";

const POLICY_FILENAMES = ["limen.yml", "limen.yaml"] as const;
const CANONICAL_SEVERITY_ORDER: readonly Exclude<Severity, "UNKNOWN">[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
];
const CANONICAL_SCOPE_ORDER: readonly Exclude<DependencyScope, "unknown">[] = [
  "runtime",
  "development",
];
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const ExternalSeveritySchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => normalizeSeverity(value))
  .refine((value) => value !== "UNKNOWN", {
    message: "must be one of low, medium, high, critical",
  });

const ExternalScopeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["runtime", "development"]));

const ExternalProductionPolicySchema = z
  .object({
    block_severity: z
      .array(ExternalSeveritySchema)
      .min(1, "must contain at least one severity")
      .superRefine((values, context) => {
        const seen = new Set<Severity>();
        values.forEach((value, index) => {
          if (seen.has(value)) {
            context.addIssue({
              code: "custom",
              path: [index],
              message: "must not contain duplicate severities after normalization",
            });
          }
          seen.add(value);
        });
      }),
    dependency_scopes: z
      .array(ExternalScopeSchema)
      .min(1, "must contain at least one dependency scope")
      .superRefine((values, context) => {
        const seen = new Set<string>();
        values.forEach((value, index) => {
          if (seen.has(value)) {
            context.addIssue({
              code: "custom",
              path: [index],
              message: "must not contain duplicate dependency scopes after normalization",
            });
          }
          seen.add(value);
        });
      }),
    missing_external_evidence: z.literal("review").default("review"),
    severity_conflict: z.literal("review").default("review"),
    cve_identity_conflict: z.literal("review").default("review"),
    telegraph_failure: z.literal("review").default("review"),
  })
  .strict();

const ExternalPolicyDocumentSchema = z
  .object({
    production: ExternalProductionPolicySchema,
  })
  .strict();

export interface LimenPolicySource {
  path: string;
  format: "yaml";
}

export interface LoadedLimenPolicy {
  policy: LimenPolicy;
  source: LimenPolicySource;
}

export interface LoadLimenPolicyOptions {
  cwd: string;
  filePath?: string;
}

type ExternalPolicyDocument = z.infer<typeof ExternalPolicyDocumentSchema>;
type NormalizedPolicyContent = Omit<LimenPolicy, "version">;

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "document";
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }
    const key = String(segment);
    return formatted === "" ? key : `${formatted}.${key}`;
  }, "");
}

function throwValidationError(
  issues: readonly { path: PropertyKey[]; message: string }[],
): never {
  const firstIssue =
    issues.find((issue) => /unrecognized key/i.test(issue.message)) ??
    issues[0];
  const firstMessage = firstIssue
    ? `${formatIssuePath(firstIssue.path)} ${firstIssue.message}.`
    : "the document does not match the supported schema.";
  throw new LimenPolicyValidationError(`Invalid Limen policy: ${firstMessage}`, {
    issues: issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
}

function findDangerousKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findDangerousKey(value[index], [...path, `[${index}]`]);
      if (result !== null) {
        return result;
      }
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const keyPath = [...path, key];
    if (DANGEROUS_KEYS.has(key)) {
      return keyPath.join(".");
    }
    const result = findDangerousKey(nestedValue, keyPath);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

function parseYamlDocument(source: string, sourcePath: string): unknown {
  let document;
  try {
    document = parseDocument(source, {
      version: "1.2",
      schema: "core",
      uniqueKeys: true,
      prettyErrors: true,
    });
  } catch (error) {
    throw new LimenPolicyParseError(`Could not parse ${sourcePath}.`, {
      error: error instanceof Error ? error.message : "unknown parser error",
    });
  }

  const duplicateError = document.errors.find(
    (error) => error.code === "DUPLICATE_KEY",
  );
  if (duplicateError) {
    throw new LimenPolicyDuplicateKeyError(
      `Duplicate key found while parsing ${sourcePath}.`,
      { error: duplicateError.message },
    );
  }

  if (document.errors.length > 0) {
    throw new LimenPolicyParseError(`Could not parse ${sourcePath}.`, {
      errors: document.errors.map((error) => ({
        code: error.code,
        message: error.message,
      })),
    });
  }

  try {
    const parsed = document.toJS({ maxAliasCount: 0 });
    const dangerousKey = findDangerousKey(parsed);
    if (dangerousKey !== null) {
      throw new LimenPolicyValidationError(
        `Invalid Limen policy: ${dangerousKey} is not allowed.`,
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof LimenPolicyValidationError) {
      throw error;
    }
    throw new LimenPolicyParseError(`Could not parse ${sourcePath}.`, {
      error: error instanceof Error ? error.message : "unknown document error",
    });
  }
}

function canonicalizePolicyContent(
  policy: NormalizedPolicyContent,
): NormalizedPolicyContent {
  return {
    blockedSeverities: [...policy.blockedSeverities].sort(
      (left, right) =>
        CANONICAL_SEVERITY_ORDER.indexOf(left) -
        CANONICAL_SEVERITY_ORDER.indexOf(right),
    ),
    dependencyScopes: [...policy.dependencyScopes].sort(
      (left, right) =>
        CANONICAL_SCOPE_ORDER.indexOf(left) - CANONICAL_SCOPE_ORDER.indexOf(right),
    ),
    missingExternalEvidence: policy.missingExternalEvidence,
    severityConflict: policy.severityConflict,
    cveIdentityConflict: policy.cveIdentityConflict,
    telegraphFailure: policy.telegraphFailure,
    unknownExposure: policy.unknownExposure,
  };
}

function serializePolicyContent(policy: NormalizedPolicyContent): string {
  return JSON.stringify({
    blockedSeverities: policy.blockedSeverities,
    dependencyScopes: policy.dependencyScopes,
    missingExternalEvidence: policy.missingExternalEvidence,
    severityConflict: policy.severityConflict,
    cveIdentityConflict: policy.cveIdentityConflict,
    telegraphFailure: policy.telegraphFailure,
    unknownExposure: policy.unknownExposure,
  });
}

function policyVersion(policy: NormalizedPolicyContent): string {
  return `LP-${createHash("sha256")
    .update(serializePolicyContent(policy), "utf8")
    .digest("hex")
    .slice(0, 12)}`;
}

function normalizeExternalPolicy(
  document: ExternalPolicyDocument,
): LimenPolicy {
  const normalizedContent = canonicalizePolicyContent({
    blockedSeverities: document.production.block_severity,
    dependencyScopes: document.production.dependency_scopes,
    missingExternalEvidence: document.production.missing_external_evidence,
    severityConflict: document.production.severity_conflict,
    cveIdentityConflict: document.production.cve_identity_conflict,
    telegraphFailure: document.production.telegraph_failure,
    unknownExposure: "review",
  });

  return validateLimenPolicy({
    version: policyVersion(normalizedContent),
    ...normalizedContent,
  });
}

export function parseLimenPolicy(
  yamlSource: string,
  sourcePath = "limen.yml",
): LimenPolicy {
  if (typeof yamlSource !== "string") {
    throw new LimenPolicyParseError(`Could not parse ${sourcePath}.`, {
      error: "Policy source must be a string.",
    });
  }

  const parsed = parseYamlDocument(yamlSource, sourcePath);
  const validated = ExternalPolicyDocumentSchema.safeParse(parsed);
  if (!validated.success) {
    throwValidationError(validated.error.issues);
  }

  return normalizeExternalPolicy(validated.data);
}

export async function loadLimenPolicy(
  options: LoadLimenPolicyOptions,
): Promise<LoadedLimenPolicy> {
  const root = resolve(options.cwd);
  const candidates = options.filePath
    ? [isAbsolute(options.filePath) ? options.filePath : resolve(root, options.filePath)]
    : POLICY_FILENAMES.map((filename) => join(root, filename));

  let sourcePath: string | undefined;
  let source: string | undefined;
  for (const candidate of candidates) {
    try {
      source = await readFile(candidate, "utf8");
      sourcePath = candidate;
      break;
    } catch (error) {
      const errorCode =
        error !== null && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (errorCode === "ENOENT" && candidates.length > 1) {
        continue;
      }
      if (errorCode === "ENOENT") {
        throw new LimenPolicyNotFoundError(
          "No limen.yml policy file was found at the repository root.",
          { paths: candidates },
        );
      }
      throw new LimenPolicyReadError("Limen policy file could not be read.", {
        path: candidate,
        errorCode: errorCode ?? "UNKNOWN_ERROR",
      });
    }
  }

  if (source === undefined || sourcePath === undefined) {
    throw new LimenPolicyNotFoundError(
      "No limen.yml policy file was found at the repository root.",
      { paths: candidates },
    );
  }

  return {
    policy: parseLimenPolicy(source, sourcePath),
    source: {
      path: sourcePath,
      format: "yaml",
    },
  };
}
