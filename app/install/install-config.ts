export function getGitHubAppInstallUrl(
  value: string | undefined = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG,
): string {
  if (
    typeof value !== "string"
    || /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    throw new Error("The GitHub App installation is not configured.");
  }

  const slug = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("The GitHub App installation is not configured.");
  }

  return `https://github.com/apps/${slug}/installations/new`;
}
