import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubAppInstallationClient,
  type GitHubAppAdapterDependencies,
} from "../packages/github-app/src";

const ACTION_SHA = "0123456789abcdef0123456789abcdef01234567";
const HEAD_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const CONFIG = {
  appId: 12345,
  appSlug: "limen-fixture",
  privateKey: "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----",
  webhookSecret: "github-webhook-secret-fixture-0123456789",
  oidcAudience: "limen-api",
  actionSha: ACTION_SHA,
};

interface FakeOctokitInstance {
  options: unknown;
  rest: {
    repos: {
      getContent: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      getBranch: ReturnType<typeof vi.fn>;
      createOrUpdateFileContents: ReturnType<typeof vi.fn>;
    };
    git: {
      createRef: ReturnType<typeof vi.fn>;
    };
    pulls: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function createFakeOctokitConstructor(): {
  constructor: GitHubAppAdapterDependencies["Octokit"];
  instances: FakeOctokitInstance[];
} {
  const instances: FakeOctokitInstance[] = [];
  const constructor = vi.fn(function FakeOctokit(this: FakeOctokitInstance, options: unknown) {
    this.options = options;
    this.rest = {
      repos: {
        getContent: vi.fn().mockResolvedValue({ data: { type: "file", path: "limen.yml" } }),
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
        getBranch: vi.fn().mockResolvedValue({ data: { commit: { sha: HEAD_SHA } } }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({ data: {} }),
      },
      git: {
        createRef: vi.fn().mockResolvedValue({ data: {} }),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({
          data: { number: 17, html_url: "https://github.com/owner/repo/pull/17" },
        }),
      },
    };
    instances.push(this);
  }) as unknown as GitHubAppAdapterDependencies["Octokit"];
  return { constructor, instances };
}

describe("GitHub App Octokit adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mints short-lived installation tokens and creates an authenticated Octokit per operation", async () => {
    const auth = vi.fn().mockResolvedValue({ token: "installation-token-fixture" });
    const createAppAuth = vi.fn().mockReturnValue(auth);
    const fakeOctokit = createFakeOctokitConstructor();
    const adapter = createGitHubAppInstallationClient(
      CONFIG,
      {
        getInstallationState: vi.fn().mockResolvedValue("ACTIVE"),
      },
      {
        createAppAuth,
        Octokit: fakeOctokit.constructor,
      },
    );

    await adapter.withInstallationClient(456, async (client) => {
      await client.getRepositoryFile({
        owner: "owner",
        repo: "repo",
        path: "limen.yml",
        ref: "main",
      });
      await client.getDefaultBranch({ owner: "owner", repo: "repo" });
      await client.createBranch({
        owner: "owner",
        repo: "repo",
        branchName: "limen/setup-456",
        fromSha: HEAD_SHA,
      });
      await client.createFile({
        owner: "owner",
        repo: "repo",
        path: "limen.yml",
        branchName: "limen/setup-456",
        content: "production:\n",
      });
      await client.createPullRequest({
        owner: "owner",
        repo: "repo",
        title: "Configure Limen",
        body: "body",
        head: "limen/setup-456",
        base: "main",
      });
      return undefined;
    });

    expect(createAppAuth).toHaveBeenCalledOnce();
    expect(createAppAuth.mock.calls[0]?.[0]).toMatchObject({
      appId: CONFIG.appId,
      privateKey: CONFIG.privateKey,
    });
    const cache = createAppAuth.mock.calls[0]?.[0].cache as {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: string) => Promise<unknown>;
    };
    expect(await cache.get("installation-cache-key")).toBeUndefined();
    await cache.set("installation-cache-key", "token-value");
    expect(auth).toHaveBeenCalledWith({ type: "installation", installationId: 456 });
    expect(fakeOctokit.instances).toHaveLength(5);
    for (const instance of fakeOctokit.instances) {
      expect(instance.options).toEqual({ auth: "installation-token-fixture" });
    }

    const [fileInstance, repositoryInstance, refInstance, fileWriteInstance, pullInstance] =
      fakeOctokit.instances;
    expect(fileInstance?.rest.repos.getContent).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: "limen.yml",
      ref: "main",
    });
    expect(repositoryInstance?.rest.repos.get).toHaveBeenCalledWith({ owner: "owner", repo: "repo" });
    expect(repositoryInstance?.rest.repos.getBranch).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "main",
    });
    expect(refInstance?.rest.git.createRef).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      ref: "refs/heads/limen/setup-456",
      sha: HEAD_SHA,
    });
    expect(fileWriteInstance?.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: "limen.yml",
      branch: "limen/setup-456",
      message: "Configure Limen",
      content: Buffer.from("production:\n", "utf8").toString("base64"),
    });
    expect(pullInstance?.rest.pulls.create).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Configure Limen",
      body: "body",
      head: "limen/setup-456",
      base: "main",
    });
  });

  it("does not mint a token when the installation is disconnected", async () => {
    const auth = vi.fn();
    const fakeOctokit = createFakeOctokitConstructor();
    const adapter = createGitHubAppInstallationClient(
      CONFIG,
      {
        getInstallationState: vi.fn().mockResolvedValue("DISCONNECTED"),
      },
      {
        createAppAuth: vi.fn().mockReturnValue(auth),
        Octokit: fakeOctokit.constructor,
      },
    );

    await expect(adapter.withInstallationClient(456, async () => undefined)).rejects.toMatchObject({
      code: "GITHUB_INSTALLATION_DISCONNECTED",
    });
    expect(auth).not.toHaveBeenCalled();
    expect(fakeOctokit.instances).toHaveLength(0);
  });
});
