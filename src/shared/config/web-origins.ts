export function parseWebOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  return [...new Set(origins)];
}
