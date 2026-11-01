export interface CatalogCursor {
  rank: number;
  userId: string;
}

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCatalogCursor(value: string | undefined): CatalogCursor | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'rank' in parsed &&
      'userId' in parsed &&
      typeof parsed.rank === 'number' &&
      Number.isFinite(parsed.rank) &&
      typeof parsed.userId === 'string'
    ) {
      return { rank: parsed.rank, userId: parsed.userId };
    }
  } catch {
    return null;
  }

  return null;
}
