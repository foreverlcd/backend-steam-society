import { decodeCatalogCursor } from './catalog.cursor.js';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('decodeCatalogCursor', () => {
  it('decodes a valid cursor', () => {
    const userId = '0195f1c2-1234-7abc-8def-0123456789ab';

    expect(decodeCatalogCursor(encode({ rank: 0.5, userId }))).toEqual({
      rank: 0.5,
      userId,
    });
  });

  it.each([
    ['a non-uuid user id', encode({ rank: 0, userId: 'x' })],
    ['an injected user id', encode({ rank: 0, userId: "x' OR 1=1 --" })],
    ['a non-finite rank', encode({ rank: null, userId: 'x' })],
    ['garbage', 'not-base64-json'],
  ])('rejects %s', (_label, value) => {
    expect(decodeCatalogCursor(value)).toBeNull();
  });
});
