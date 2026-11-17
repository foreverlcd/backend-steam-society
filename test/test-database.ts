export function getTestDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error('DATABASE_URL is required to run e2e tests');
  }

  // E2E_DATABASE_NAME lets parallel worktrees/agents use separate databases.
  const name = process.env.E2E_DATABASE_NAME ?? 'steam_society_test';
  if (!/^steam_society_test[a-z0-9_]*$/.test(name)) {
    throw new Error('E2E_DATABASE_NAME must start with steam_society_test');
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
