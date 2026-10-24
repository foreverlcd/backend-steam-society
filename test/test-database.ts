export function getTestDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error('DATABASE_URL is required to run e2e tests');
  }

  const url = new URL(baseUrl);
  url.pathname = '/steam_society_test';
  return url.toString();
}
