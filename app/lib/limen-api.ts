import {
  REPOSITORY_LIFECYCLE_STATES,
  type LimenReleaseDecision,
  type RepositoryLifecycleState,
} from "../../packages/github-app/src/types";

const MAX_RESPONSE_BYTES = 512 * 1024;
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const KNOWN_ERROR_CODES = new Set([
  "GITHUB_AUTH_REQUIRED",
  "GITHUB_AUTH_MALFORMED",
  "GITHUB_AUTH_INVALID",
  "GITHUB_IDENTITY_REQUIRED",
  "GITHUB_USER_METADATA_UNAVAILABLE",
  "GITHUB_INSTALLATION_ID_INVALID",
  "GITHUB_INSTALLATION_USER_MISMATCH",
  "INSTALLATION_NOT_CONFIRMED",
  "INSTALLATION_DISCONNECTED",
  "INSTALLATION_ALREADY_BOUND",
  "GITHUB_REPOSITORY_ID_INVALID",
  "GITHUB_REPOSITORY_NOT_FOUND",
  "GITHUB_REPOSITORY_DISCONNECTED",
  "GITHUB_REPOSITORY_ROUTE_NOT_FOUND",
  "GITHUB_SETUP_PR_ALREADY_OPEN",
  "GITHUB_SETUP_INPUT_INVALID",
  "SETUP_CONFIG_INVALID",
  "SETUP_INSPECTION_FAILED",
  "SETUP_GITHUB_ERROR",
  "SETUP_PERSISTENCE_FAILED",
  "SETUP_PR_CREATED",
  "OPEN_SETUP_PR_EXISTS",
  "ALREADY_CONFIGURED_FILES_PRESENT",
]);

export type LimenApiErrorCode = string;

export class LimenApiError extends Error {
  readonly status: number;
  readonly code: LimenApiErrorCode;

  constructor(status: number, code: LimenApiErrorCode, message: string) {
    super(message);
    this.name = "LimenApiError";
    this.status = status;
    this.code = code;
  }
}

export interface LimenSetupPullRequest {
  number: number;
  url: string;
  state: "OPEN";
}

export interface LimenRepository {
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  lifecycleState: RepositoryLifecycleState;
  latestDecision: LimenReleaseDecision | null;
  latestEvaluationAt: string | null;
  setupPullRequest: LimenSetupPullRequest | null;
}

export type SetupFilePath = "limen.yml" | "limen.yaml" | ".github/workflows/limen.yml";

export interface LimenSetupFilePreview {
  path: SetupFilePath;
  status: "missing" | "existing";
  content?: string;
}

export interface LimenSetupPreview {
  repositoryId: number;
  files: LimenSetupFilePreview[];
  filesToCreate: SetupFilePath[];
  alreadyConfigured: boolean;
}

export interface SetupPullRequestResult {
  repositoryId: number;
  code: "SETUP_PR_CREATED" | "OPEN_SETUP_PR_EXISTS";
  setupPullRequest: LimenSetupPullRequest;
}

export interface LimenApi {
  bindInstallation(
    installationId: number,
    accessToken: string,
  ): Promise<{ bound: true; installationId: number; alreadyBound?: boolean }>;
  listRepositories(accessToken: string): Promise<LimenRepository[]>;
  getRepository(repositoryId: number, accessToken: string): Promise<LimenRepository>;
  getSetupPreview(repositoryId: number, accessToken: string): Promise<LimenSetupPreview>;
  createSetupPullRequest(
    repositoryId: number,
    accessToken: string,
  ): Promise<SetupPullRequestResult>;
}

export function normalizeLimenApiBaseUrl(
  value: string,
  environment = process.env.NODE_ENV,
): string {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    const localHttp = url.protocol === "http:" && LOCAL_API_HOSTS.has(url.hostname);
    if (
      (url.protocol !== "https:" && !(environment !== "production" && localHttp))
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || /[\u0000-\u001f\u007f-\u009f]/.test(trimmed)
    ) {
      throw new Error("unsafe URL");
    }
  } catch {
    throw new LimenApiError(500, "LIMEN_API_CONFIG_INVALID", "The Limen API is not configured safely.");
  }
  return normalized;
}

export function parsePositiveSafeInteger(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getInstallationId(value: string): number | null {
  return parsePositiveSafeInteger(value);
}

export function limenApiErrorMessage(error: unknown): string {
  if (!(error instanceof LimenApiError)) {
    return "Limen is temporarily unavailable. Try again.";
  }
  if (error.status === 401) {
    return "Your Limen session has expired. Sign in again.";
  }
  if (error.status === 403) {
    return "You are not authorized to manage this GitHub resource.";
  }
  if (error.status === 404) {
    return "This GitHub repository is not available.";
  }
  if (error.status === 409 && error.code === "INSTALLATION_NOT_CONFIRMED") {
    return "GitHub is still confirming this installation. Try again shortly.";
  }
  if (error.status === 409 && error.code === "ALREADY_CONFIGURED_FILES_PRESENT") {
    return "Some Limen setup files already exist. Review the existing configuration before creating a PR.";
  }
  if (error.status === 409 && error.code === "INSTALLATION_DISCONNECTED") {
    return "This GitHub installation is disconnected. Reinstall or reconnect Limen to continue.";
  }
  if (error.status >= 500) {
    return "Limen is temporarily unavailable. Try again.";
  }
  return "Limen could not complete that request.";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maxLength = 2048): string | null {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value.length > maxLength
    || /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    return null;
  }
  return value;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function lifecycleState(value: unknown): RepositoryLifecycleState | null {
  return typeof value === "string" && (REPOSITORY_LIFECYCLE_STATES as readonly string[]).includes(value)
    ? value as RepositoryLifecycleState
    : null;
}

function releaseDecision(value: unknown): LimenReleaseDecision | null {
  return value === null || value === undefined
    ? null
    : value === "PASS" || value === "HOLD" || value === "REVIEW"
      ? value
      : null;
}

function safeGitHubPullRequestUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "github.com"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && /^\/[^/]+\/[^/]+\/pull\/[1-9]\d*$/.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parseSetupPullRequest(value: unknown): LimenSetupPullRequest | null {
  if (value === null) {
    return null;
  }
  const row = objectValue(value);
  const number = positiveNumber(row?.number);
  const url = safeGitHubPullRequestUrl(row?.url);
  if (number === null || url === null || row?.state !== "OPEN") {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid response.");
  }
  return { number, url, state: "OPEN" };
}

function parseRepository(value: unknown): LimenRepository {
  const row = objectValue(value);
  const repositoryId = positiveNumber(row?.repositoryId);
  const owner = boundedText(row?.owner, 100);
  const name = boundedText(row?.name, 100);
  const fullName = boundedText(row?.fullName, 201);
  const defaultBranch = boundedText(row?.defaultBranch, 255);
  const state = lifecycleState(row?.lifecycleState);
  const latestEvaluationAt = row?.latestEvaluationAt === null || row?.latestEvaluationAt === undefined
    ? null
    : boundedText(row.latestEvaluationAt, 64);
  const latestDecision = releaseDecision(row?.latestDecision);
  if (
    repositoryId === null
    || owner === null
    || name === null
    || fullName === null
    || defaultBranch === null
    || state === null
    || (row?.latestEvaluationAt !== null && row?.latestEvaluationAt !== undefined && latestEvaluationAt === null)
    || (row?.latestDecision !== null && row?.latestDecision !== undefined && latestDecision === null)
  ) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid response.");
  }
  return {
    repositoryId,
    owner,
    name,
    fullName,
    defaultBranch,
    lifecycleState: state,
    latestDecision,
    latestEvaluationAt,
    setupPullRequest: parseSetupPullRequest(row?.setupPullRequest),
  };
}

function parseRepositories(value: unknown): LimenRepository[] {
  const row = objectValue(value);
  if (!Array.isArray(row?.repositories)) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid response.");
  }
  return row.repositories.map(parseRepository);
}

function setupFilePath(value: unknown): SetupFilePath | null {
  return value === "limen.yml" || value === "limen.yaml" || value === ".github/workflows/limen.yml"
    ? value
    : null;
}

function parseSetupPreviewFile(value: unknown): LimenSetupFilePreview {
  const row = objectValue(value);
  const path = setupFilePath(row?.path);
  const content = row?.content;
  if (path === null || (row?.status !== "missing" && row?.status !== "existing")) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup preview.");
  }
  if (content !== undefined && typeof content !== "string") {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup preview.");
  }
  const parsed: LimenSetupFilePreview = {
    path,
    status: row.status,
  };
  return content === undefined ? parsed : { ...parsed, content };
}

function parseSetupPreview(value: unknown): LimenSetupPreview {
  const row = objectValue(value);
  const repositoryId = positiveNumber(row?.repositoryId);
  if (repositoryId === null || !Array.isArray(row?.files) || !Array.isArray(row?.filesToCreate) || typeof row.alreadyConfigured !== "boolean") {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup preview.");
  }
  const filesToCreate = row.filesToCreate.map(setupFilePath);
  if (filesToCreate.some((path): path is null => path === null)) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup preview.");
  }
  return {
    repositoryId,
    files: row.files.map(parseSetupPreviewFile),
    filesToCreate: filesToCreate as SetupFilePath[],
    alreadyConfigured: row.alreadyConfigured,
  };
}

function parseBindResponse(value: unknown): { bound: true; installationId: number; alreadyBound?: boolean } {
  const row = objectValue(value);
  const installationId = positiveNumber(row?.installationId);
  if (row?.bound !== true || installationId === null || (row?.alreadyBound !== undefined && typeof row.alreadyBound !== "boolean")) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid installation response.");
  }
  return {
    bound: true,
    installationId,
    ...(row.alreadyBound === true ? { alreadyBound: true } : {}),
  };
}

function parseSetupPullRequestResult(value: unknown): SetupPullRequestResult {
  const row = objectValue(value);
  const repositoryId = positiveNumber(row?.repositoryId);
  if (
    repositoryId === null
    || (row?.code !== "SETUP_PR_CREATED" && row?.code !== "OPEN_SETUP_PR_EXISTS")
  ) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup response.");
  }
  const setupPullRequest = parseSetupPullRequest(row.setupPullRequest);
  if (setupPullRequest === null) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID", "Limen returned an invalid setup response.");
  }
  return { repositoryId, code: row.code, setupPullRequest };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number.isFinite(Number(contentLength)) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_TOO_LARGE", "Limen returned an oversized response.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new LimenApiError(502, "LIMEN_RESPONSE_TOO_LARGE", "Limen returned an oversized response.");
  }
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LimenApiError(502, "LIMEN_RESPONSE_INVALID_JSON", "Limen returned invalid JSON.");
  }
}

function responseError(status: number, body: unknown): LimenApiError {
  const codeValue = objectValue(body)?.code;
  const code = typeof codeValue === "string" && KNOWN_ERROR_CODES.has(codeValue)
    ? codeValue
    : `LIMEN_API_HTTP_${status}`;
  return new LimenApiError(status, code, limenApiErrorMessage(new LimenApiError(status, code, "")));
}

function requireAccessToken(accessToken: string): void {
  if (typeof accessToken !== "string" || accessToken.length === 0 || /\s/.test(accessToken)) {
    throw new LimenApiError(401, "GITHUB_AUTH_REQUIRED", "A valid Limen session is required.");
  }
}

function requireId(repositoryId: number, code: string): number {
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    throw new LimenApiError(400, code, "The requested ID is invalid.");
  }
  return repositoryId;
}

export function createLimenApi(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): LimenApi {
  const normalizedBaseUrl = normalizeLimenApiBaseUrl(baseUrl);

  async function request<T>(
    path: string,
    accessToken: string,
    method: "GET" | "POST",
    parser: (value: unknown) => T,
  ): Promise<T> {
    requireAccessToken(accessToken);
    let response: Response;
    try {
      response = await fetcher(`${normalizedBaseUrl}${path}`, {
        method,
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      throw new LimenApiError(503, "LIMEN_NETWORK_ERROR", "Limen is temporarily unavailable. Try again.");
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response);
    } catch (error) {
      if (!response.ok) {
        throw responseError(response.status, null);
      }
      throw error;
    }
    if (!response.ok) {
      throw responseError(response.status, body);
    }
    return parser(body);
  }

  return {
    bindInstallation: (installationId, accessToken) => request(
      `/v1/github/installations/${requireId(installationId, "GITHUB_INSTALLATION_ID_INVALID")}/bind`,
      accessToken,
      "POST",
      parseBindResponse,
    ),
    listRepositories: (accessToken) => request(
      "/v1/github/repositories",
      accessToken,
      "GET",
      parseRepositories,
    ),
    getRepository: (repositoryId, accessToken) => request(
      `/v1/github/repositories/${requireId(repositoryId, "GITHUB_REPOSITORY_ID_INVALID")}`,
      accessToken,
      "GET",
      parseRepository,
    ),
    getSetupPreview: (repositoryId, accessToken) => request(
      `/v1/github/repositories/${requireId(repositoryId, "GITHUB_REPOSITORY_ID_INVALID")}/setup-preview`,
      accessToken,
      "GET",
      parseSetupPreview,
    ),
    createSetupPullRequest: (repositoryId, accessToken) => request(
      `/v1/github/repositories/${requireId(repositoryId, "GITHUB_REPOSITORY_ID_INVALID")}/setup-pr`,
      accessToken,
      "POST",
      parseSetupPullRequestResult,
    ),
  };
}
