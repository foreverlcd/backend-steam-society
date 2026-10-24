export function parseWebOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  if (origins.includes('*')) {
    throw new Error(
      'WEB_ORIGIN cannot contain "*" because CORS uses credentials',
    );
  }

  return [...new Set(origins)];
}
