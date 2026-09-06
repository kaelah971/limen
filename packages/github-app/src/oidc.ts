import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";

export const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GITHUB_ACTIONS_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
export const GITHUB_ACTIONS_OIDC_MAX_TOKEN_BYTES = 16 * 1024;

const WORKFLOW_PATH = "/.github/workflows/limen.yml@";
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;
const SHA_PATTERN = /^[0-9a-fA-F]{40}$/;

export interface GitHubActionsOidcVerifyOptions {
  issuer: typeof GITHUB_ACTIONS_OIDC_ISSUER;
  audience: string;
  algorithms: ["RS256"];
}

export interface GitHubActionsOidcVerificationResult {
  payload: JWTPayload | Record<string, unknown>;
}

export type GitHubActionsOidcVerifier = (
  token: string,
  options: GitHubActionsOidcVerifyOptions,
) => Promise<GitHubActionsOidcVerificationResult>;

export interface VerifiedGitHubActionsIdentity {
  repository: string;
  repositoryId: number;
  runId: number;
  runAttempt: number;
  workflowRef: string;
}

export type GitHubActionsOidcErrorCode =
  | "GITHUB_OIDC_REJECTED"
  | "GITHUB_OIDC_TOKEN_TOO_LARGE";

export class GitHubActionsOidcError extends Error {
  readonly code: GitHubActionsOidcErrorCode;

  constructor(code: GitHubActionsOidcErrorCode, message: string) {
    super(message);
    this.name = "GitHubActionsOidcError";
    this.code = code;
  }
}

const githubActionsJwks = createRemoteJWKSet(new URL(GITHUB_ACTIONS_OIDC_JWKS_URL));

const productionVerifier: GitHubActionsOidcVerifier = (token, options) =>
  jwtVerify(token, githubActionsJwks, options);

function reject(message = "The GitHub Actions OIDC token is invalid."): never {
  throw new GitHubActionsOidcError("GITHUB_OIDC_REJECTED", message);
}

function claimObject(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return reject();
  }
  return payload as Record<string, unknown>;
}

function claimText(
  claims: Record<string, unknown>,
  name: string,
  maxLength: number,
): string {
  const value = claims[name];
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return reject();
  }
  return value;
}

function positiveIntegerClaim(
  claims: Record<string, unknown>,
  name: string,
): number {
  const value = claims[name];
  if (
    typeof value !== "string"
    || !/^\d+$/.test(value)
  ) {
    return reject();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return reject();
  }
  return parsed;
}

function verifyAudience(value: unknown, expectedAudience: string): boolean {
  return typeof value === "string"
    ? value === expectedAudience
    : Array.isArray(value)
      && value.length > 0
      && value.every((entry) => typeof entry === "string")
      && value.includes(expectedAudience);
}

function verifyTimeClaims(claims: Record<string, unknown>): void {
  const now = Math.floor(Date.now() / 1000);
  const expiration = claims.exp;
  if (expiration !== undefined) {
    if (typeof expiration !== "number" || !Number.isFinite(expiration) || expiration <= now) {
      reject();
    }
  }
  const notBefore = claims.nbf;
  if (notBefore !== undefined) {
    if (typeof notBefore !== "number" || !Number.isFinite(notBefore) || notBefore > now) {
      reject();
    }
  }
}

function verifyWorkflowRef(repository: string, workflowRef: string): void {
  if (!REPOSITORY_PATTERN.test(repository) || !workflowRef.startsWith(`${repository}${WORKFLOW_PATH}`)) {
    reject();
  }
  const ref = workflowRef.slice(`${repository}${WORKFLOW_PATH}`.length);
  if (ref.length === 0 || ref.length > 512 || /[\s\u0000-\u001f\u007f]/.test(ref)) {
    reject();
  }
}

function verifiedIdentity(payload: unknown, expectedAudience: string): VerifiedGitHubActionsIdentity {
  const claims = claimObject(payload);
  if (claims.iss !== GITHUB_ACTIONS_OIDC_ISSUER || !verifyAudience(claims.aud, expectedAudience)) {
    reject();
  }
  verifyTimeClaims(claims);

  const repository = claimText(claims, "repository", 140);
  const repositoryId = positiveIntegerClaim(claims, "repository_id");
  const runId = positiveIntegerClaim(claims, "run_id");
  const runAttempt = positiveIntegerClaim(claims, "run_attempt");
  const workflowRef = claimText(claims, "workflow_ref", 700);
  verifyWorkflowRef(repository, workflowRef);

  const sha = claims.sha;
  if (sha !== undefined && (typeof sha !== "string" || !SHA_PATTERN.test(sha))) {
    reject();
  }

  return { repository, repositoryId, runId, runAttempt, workflowRef };
}

export async function verifyGitHubActionsOidcToken(
  token: string,
  expectedAudience: string,
  verifier: GitHubActionsOidcVerifier = productionVerifier,
): Promise<VerifiedGitHubActionsIdentity> {
  if (typeof token !== "string" || token.length === 0) {
    return reject();
  }
  if (new TextEncoder().encode(token).byteLength > GITHUB_ACTIONS_OIDC_MAX_TOKEN_BYTES) {
    throw new GitHubActionsOidcError(
      "GITHUB_OIDC_TOKEN_TOO_LARGE",
      "The GitHub Actions OIDC token is too large.",
    );
  }

  const options: GitHubActionsOidcVerifyOptions = {
    issuer: GITHUB_ACTIONS_OIDC_ISSUER,
    audience: expectedAudience,
    algorithms: ["RS256"],
  };
  let result: GitHubActionsOidcVerificationResult;
  try {
    result = await verifier(token, options);
  } catch {
    throw new GitHubActionsOidcError(
      "GITHUB_OIDC_REJECTED",
      "The GitHub Actions OIDC token could not be verified.",
    );
  }

  return verifiedIdentity(result?.payload, expectedAudience);
}
