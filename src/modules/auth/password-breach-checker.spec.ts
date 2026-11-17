import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordBreachChecker } from './password-breach-checker.js';

function checker(mode: 'off' | 'hibp'): PasswordBreachChecker {
  return new PasswordBreachChecker({
    get: () => mode,
  } as unknown as ConfigService);
}

function suffixOf(password: string): string {
  return createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase()
    .slice(5);
}

describe('PasswordBreachChecker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the 5-char prefix and rejects a listed password', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          `0000000000000000000000000000000000A:0\r\n${suffixOf('hunter2-hunter2')}:42\r\n`,
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      checker('hibp').assertNotBreached('hunter2-hunter2'),
    ).rejects.toMatchObject({
      response: { code: 'PASSWORD_BREACHED' },
    });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
  });

  it('ignores padding rows with count 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`${suffixOf('padded-one-123')}:0\n`)),
    );
    await expect(checker('hibp').isBreached('padded-one-123')).resolves.toBe(
      false,
    );
  });

  it('fails open when the service is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(
      checker('hibp').assertNotBreached('whatever-123'),
    ).resolves.toBeUndefined();
  });

  it('does nothing when disabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await checker('off').assertNotBreached('password');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
