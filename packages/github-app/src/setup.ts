import {
  GitHubInstallationClientError,
  type GitHubDefaultBranchResponse,
  type GitHubInstallationApi,
  type GitHubInstallationClientFactory,
  type GitHubPullRequestResponse,
} from "./client";

const ACTION_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const WORKFLOW_PATH = ".github/workflows/limen.yml" as const;

export type SetupPolicyPath = "limen.yml" | "limen.yaml";
export type SetupFilePath = SetupPolicyPath | typeof WORKFLOW_PATH;

export interface SetupRepository {
  installationId: number;
  repositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface SetupGenerationConfig {
  actionSha: string;
  limenApiUrl: string;
}

export interface SetupFilePreview {
  path: SetupFilePath;
  status: "missing" | "existing";
  content?: string;
}

export interface SetupInspection {
  files: SetupFilePreview[];
  filesToCreate: SetupFilePath[];
  alreadyConfigured: boolean;
}

export interface SetupPullRequestRecord {
  repositoryId: number;
  prNumber: number;
  prUrl: string;
  branchName: string;
  state: "OPEN";
}

export interface SetupPersistence {
  getOpenSetupPullRequest(
    repositoryId: number,
  ): Promise<SetupPullRequestRecord | null>;
  recordSetupPullRequestAndTransition(input: {
    repositoryId: number;
    prNumber: number;
    prUrl: string;
    branchName: string;
  }): Promise<SetupPullRequestRecord>;
}

export interface SetupServiceDependencies {
  installationClient: GitHubInstallationClientFactory;
  persistence: SetupPersistence;
  setupConfig: SetupGenerationConfig;
  now?: () => number;
}

export interface SetupService {
  inspectSetup(repository: SetupRepository): Promise<SetupInspection>;
  createSetupPullRequest(
    repository: SetupRepository,
    config: SetupGenerationConfig,
  ): Promise<SetupPullRequestResult>;
}

export type SetupPullRequestResult =
  | {
      code: "SETUP_PR_CREATED";
      setupPullRequest: SetupPullRequestRecord;
    }
  | {
      code: "OPEN_SETUP_PR_EXISTS";
      setupPullRequest: SetupPullRequestRecord;
    }
  | {
      code: "ALREADY_CONFIGURED_FILES_PRESENT";
      inspection: SetupInspection;
    };

export class SetupError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SetupError";
    this.code = code;
  }
}

export class SetupConfigError extends SetupError {
  constructor() {
    super("SETUP_CONFIG_INVALID", "The setup generation configuration is invalid.");
    this.name = "SetupConfigError";
  }
}

export class SetupInspectionError extends SetupError {
  constructor() {
    super("SETUP_INSPECTION_FAILED", "The repository setup state could not be inspected.");
    this.name = "SetupInspectionError";
  }
}

export class SetupGitHubError extends SetupError {
  constructor() {
    super("SETUP_GITHUB_ERROR", "The setup pull request could not be created on GitHub.");
    this.name = "SetupGitHubError";
  }
}

export class SetupPersistenceError extends SetupError {
  constructor() {
    super(
      "SETUP_PERSISTENCE_FAILED",
      "The setup pull request was created but could not be recorded.",
    );
    this.name = "SetupPersistenceError";
  }
}

export const DEFAULT_LIMEN_POLICY = `production:
  block_severity:
    - critical
    - high
  dependency_scopes:
    - runtime
  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review
`;

export function buildLimenWorkflow(config: SetupGenerationConfig): string {
  validateGenerationConfig(config);
  return [
    "name: Limen",
    "",
    "on:",
    "  pull_request:",
    "    types:",
    "      - opened",
    "      - synchronize",
    "      - reopened",
    "",
    "permissions:",
    "  contents: read",
    "  id-token: write",
    "",
    "jobs:",
    "  limen:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Evaluate release evidence",
    `        uses: kaelah971/limen@${config.actionSha}`,
    "        with:",
    "          github-token: ${{ github.token }}",
    "          telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}",
    "          telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}",
    `          limen-api-url: ${config.limenApiUrl}`,
    "",
  ].join("\n");
}

function validateGenerationConfig(config: SetupGenerationConfig): void {
  if (!ACTION_SHA_PATTERN.test(config.actionSha)) {
    throw new SetupConfigError();
  }
  if (config.limenApiUrl.trim() !== config.limenApiUrl || /\s/.test(config.limenApiUrl)) {
    throw new SetupConfigError();
  }
  try {
    const url = new URL(config.limenApiUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new SetupConfigError();
    }
  } catch (error) {
    if (error instanceof SetupConfigError) {
      throw error;
    }
    throw new SetupConfigError();
  }
}

function repositoryInput(repository: SetupRepository) {
  return { owner: repository.owner, repo: repository.name };
}

async function fileExists(
  client: GitHubInstallationApi,
  repository: SetupRepository,
  path: SetupFilePath,
): Promise<boolean> {
  try {
    const result = await client.getRepositoryFile({
      ...repositoryInput(repository),
      path,
      ref: repository.defaultBranch,
    });
    if (result.type !== "file" || result.path !== path) {
      throw new SetupInspectionError();
    }
    return true;
  } catch (error) {
    if (error instanceof GitHubInstallationClientError && error.status === 404) {
      return false;
    }
    if (error instanceof SetupInspectionError) {
      throw error;
    }
    throw new SetupInspectionError();
  }
}

async function inspectWithClient(
  repository: SetupRepository,
  config: SetupGenerationConfig,
  client: GitHubInstallationApi,
): Promise<SetupInspection> {
  const policyYmlExists = await fileExists(client, repository, "limen.yml");
  const policyYamlExists = await fileExists(client, repository, "limen.yaml");
  const workflowExists = await fileExists(client, repository, WORKFLOW_PATH);
  const files: SetupFilePreview[] = [];
  const filesToCreate: SetupFilePath[] = [];

  if (policyYmlExists) {
    files.push({ path: "limen.yml", status: "existing" });
  }
  if (policyYamlExists) {
    files.push({ path: "limen.yaml", status: "existing" });
  }
  if (!policyYmlExists && !policyYamlExists) {
    files.push({ path: "limen.yml", status: "missing", content: DEFAULT_LIMEN_POLICY });
    filesToCreate.push("limen.yml");
  }

  if (workflowExists) {
    files.push({ path: WORKFLOW_PATH, status: "existing" });
  } else {
    files.push({
      path: WORKFLOW_PATH,
      status: "missing",
      content: buildLimenWorkflow(config),
    });
    filesToCreate.push(WORKFLOW_PATH);
  }

  return {
    files,
    filesToCreate,
    alreadyConfigured: (policyYmlExists || policyYamlExists) && workflowExists,
  };
}

export async function inspectSetup(
  repository: SetupRepository,
  dependencies: SetupServiceDependencies,
): Promise<SetupInspection> {
  validateGenerationConfig(dependencies.setupConfig);
  try {
    return await dependencies.installationClient.withInstallationClient(
      repository.installationId,
      (client) => inspectWithClient(repository, dependencies.setupConfig, client),
    );
  } catch (error) {
    if (error instanceof GitHubInstallationClientError) {
      if (error.code !== "GITHUB_INSTALLATION_REQUEST_FAILED" &&
        error.code !== "GITHUB_INSTALLATION_RESPONSE_INVALID") {
        throw error;
      }
      throw new SetupInspectionError();
    }
    if (error instanceof SetupError) {
      throw error;
    }
    throw new SetupInspectionError();
  }
}

function setupPullRequestBody(): string {
  return [
    "## Configure Limen",
    "",
    "Before merging this pull request:",
    "",
    "- Add `LIMEN_TELEGRAPH_PRIVATE_KEY` to the GitHub repository Secrets.",
    "- Add `TELEGRAPH_ENGINE_URL` to the GitHub repository Variables.",
    "- Never paste the Telegraph private key into Limen.",
    "- Review or edit `limen.yml` before merging if your policy differs.",
    "",
    "Merging this pull request configures Limen. The repository becomes VERIFIED only after the first accepted real evaluation.",
  ].join("\n");
}

interface CreateSetupOperation {
  inspection: SetupInspection;
  pullRequest?: GitHubPullRequestResponse;
  branchName?: string;
  baseBranch?: string;
}

export async function createSetupPullRequest(
  repository: SetupRepository,
  config: SetupGenerationConfig,
  dependencies: SetupServiceDependencies,
): Promise<SetupPullRequestResult> {
  let existing: SetupPullRequestRecord | null;
  try {
    existing = await dependencies.persistence.getOpenSetupPullRequest(repository.repositoryId);
  } catch {
    throw new SetupPersistenceError();
  }
  if (existing !== null) {
    return { code: "OPEN_SETUP_PR_EXISTS", setupPullRequest: existing };
  }
  validateGenerationConfig(config);

  let operation: CreateSetupOperation;
  try {
    operation = await dependencies.installationClient.withInstallationClient(
      repository.installationId,
      async (client) => {
        const inspection = await inspectWithClient(repository, config, client);
        if (inspection.alreadyConfigured) {
          return { inspection };
        }

        const defaultBranch: GitHubDefaultBranchResponse = await client.getDefaultBranch(
          repositoryInput(repository),
        );
        const branchName = `limen/setup-${repository.repositoryId}-${Math.floor(
          (dependencies.now?.() ?? Date.now()) / 1000,
        )}`;
        await client.createBranch({
          ...repositoryInput(repository),
          branchName,
          fromSha: defaultBranch.headSha,
        });
        for (const file of inspection.files) {
          if (file.status !== "missing" || file.content === undefined) {
            continue;
          }
          await client.createFile({
            ...repositoryInput(repository),
            path: file.path,
            branchName,
            content: file.content,
          });
        }
        const pullRequest = await client.createPullRequest({
          ...repositoryInput(repository),
          title: "Configure Limen release evidence gate",
          body: setupPullRequestBody(),
          head: branchName,
          base: defaultBranch.branchName,
        });
        return {
          inspection,
          pullRequest,
          branchName,
          baseBranch: defaultBranch.branchName,
        };
      },
    );
  } catch (error) {
    if (error instanceof GitHubInstallationClientError && error.code === "GITHUB_INSTALLATION_DISCONNECTED") {
      throw error;
    }
    throw new SetupGitHubError();
  }

  if (operation.pullRequest === undefined || operation.branchName === undefined) {
    return {
      code: "ALREADY_CONFIGURED_FILES_PRESENT",
      inspection: operation.inspection,
    };
  }

  try {
    const setupPullRequest = await dependencies.persistence.recordSetupPullRequestAndTransition({
      repositoryId: repository.repositoryId,
      prNumber: operation.pullRequest.number,
      prUrl: operation.pullRequest.url,
      branchName: operation.branchName,
    });
    return { code: "SETUP_PR_CREATED", setupPullRequest };
  } catch {
    throw new SetupPersistenceError();
  }
}

export function createSetupService(
  dependencies: SetupServiceDependencies,
): SetupService {
  return {
    inspectSetup: (repository) => inspectSetup(repository, dependencies),
    createSetupPullRequest: (repository, config) =>
      createSetupPullRequest(repository, config, dependencies),
  };
}
