import type { IncomingMessage } from "node:http";
import type { GitHubUserInput } from "./github-app-store";

export interface SupabaseAuthIdentity {
  provider: string;
  identity_data?: unknown;
}

export interface SupabaseAuthUser {
  id: string;
  identities?: readonly SupabaseAuthIdentity[] | null;
  user_metadata?: unknown;
}

export interface UserAuthClient {
  auth: {
    getUser(accessToken: string): Promise<{
      data: { user: SupabaseAuthUser | null };
      error: unknown | null;
    }>;
  };
}

export interface GitHubUserMetadataStore {
  upsertGitHubUser(input: GitHubUserInput): Promise<void>;
}

export interface AuthenticatedGitHubUser {
  authUserId: string;
  githubUserId: number;
  githubLogin: string;
}

export class UserAuthError extends Error {
  readonly status: 401 | 403 | 500;
  readonly code:
    | "GITHUB_AUTH_REQUIRED"
    | "GITHUB_AUTH_MALFORMED"
    | "GITHUB_AUTH_INVALID"
    | "GITHUB_IDENTITY_REQUIRED"
    | "GITHUB_USER_METADATA_UNAVAILABLE";

  constructor(
    status: 401 | 403 | 500,
    code: UserAuthError["code"],
    message: string,
  ) {
    super(message);
    this.name = "UserAuthError";
    this.status = status;
    this.code = code;
  }
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    if (authorization === undefined) {
      throw new UserAuthError(
        401,
        "GITHUB_AUTH_REQUIRED",
        "A valid Supabase access token is required.",
      );
    }
    throw new UserAuthError(
      401,
      "GITHUB_AUTH_MALFORMED",
      "The Supabase authorization header is malformed.",
    );
  }
  const match = /^Bearer ([^\s\u0000-\u001f\u007f]+)$/.exec(authorization);
  if (match === null || match[1] === undefined) {
    throw new UserAuthError(
      401,
      "GITHUB_AUTH_MALFORMED",
      "The Supabase authorization header is malformed.",
    );
  }
  return match[1];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveGithubUserId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function boundedLogin(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const login = value.trim();
  return login !== "" && login.length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/.test(login)
    ? login
    : null;
}

function supabaseAuthUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function githubIdentity(user: SupabaseAuthUser): AuthenticatedGitHubUser | null {
  const identity = user.identities?.find((candidate) => candidate.provider === "github");
  const data = objectValue(identity?.identity_data);
  if (identity === undefined || data === null) {
    return null;
  }

  const githubUserId = positiveGithubUserId(
    data.provider_id,
  );
  const githubLogin = boundedLogin(
    data.login ?? data.user_name,
  );
  const authUserId = supabaseAuthUserId(user.id);
  if (githubUserId === null || githubLogin === null || authUserId === null) {
    return null;
  }

  return { authUserId, githubUserId, githubLogin };
}

export async function authenticateUser(
  request: IncomingMessage,
  client: UserAuthClient,
  metadataStore?: GitHubUserMetadataStore,
): Promise<AuthenticatedGitHubUser> {
  const accessToken = bearerToken(request);
  let result: Awaited<ReturnType<UserAuthClient["auth"]["getUser"]>>;
  try {
    result = await client.auth.getUser(accessToken);
  } catch {
    throw new UserAuthError(
      401,
      "GITHUB_AUTH_INVALID",
      "The Supabase access token is invalid.",
    );
  }

  if (
    result === null
    || typeof result !== "object"
    || result.error !== null
    || result.data === null
    || typeof result.data !== "object"
    || result.data.user === null
  ) {
    throw new UserAuthError(
      401,
      "GITHUB_AUTH_INVALID",
      "The Supabase access token is invalid.",
    );
  }

  const authenticatedUser = githubIdentity(result.data.user);
  if (authenticatedUser === null) {
    throw new UserAuthError(
      403,
      "GITHUB_IDENTITY_REQUIRED",
      "A verified GitHub identity is required.",
    );
  }
  if (metadataStore !== undefined) {
    try {
      await metadataStore.upsertGitHubUser(authenticatedUser);
    } catch {
      throw new UserAuthError(
        500,
        "GITHUB_USER_METADATA_UNAVAILABLE",
        "The GitHub user metadata could not be saved.",
      );
    }
  }
  return authenticatedUser;
}
