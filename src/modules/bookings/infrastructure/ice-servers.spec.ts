import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfiguredIceServers } from './ice-servers.js';

function configWith(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const SECRET = 'x'.repeat(40);

describe('ConfiguredIceServers', () => {
  afterEach(() => vi.useRealTimers());

  it('returns only STUN when no TURN is configured', async () => {
    const ice = new ConfiguredIceServers(
      configWith({ CALL_STUN_URLS: 'stun:a:3478, stun:b:3478' }),
    );
    expect(await ice.forCall()).toEqual([
      { urls: ['stun:a:3478', 'stun:b:3478'] },
    ]);
  });

  it('issues expiring coturn credentials that coturn can verify', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const ice = new ConfiguredIceServers(
      configWith({
        CALL_STUN_URLS: 'stun:a:3478',
        CALL_TURN_SHARED_SECRET: SECRET,
        CALL_TURN_URLS:
          'turn:turn.example.org:3478,turns:turn.example.org:5349',
      }),
    );

    const [, turn] = await ice.forCall();
    expect(turn.urls).toEqual([
      'turn:turn.example.org:3478',
      'turns:turn.example.org:5349',
    ]);
    const [expiry] = turn.username!.split(':');
    // Four hours from now.
    expect(Number(expiry)).toBe(Date.UTC(2026, 10, 18, 14) / 1000);
    expect(turn.credential).toBe(
      createHmac('sha1', SECRET).update(turn.username!).digest('base64'),
    );

    const [, again] = await ice.forCall();
    expect(again.username).not.toBe(turn.username);
  });

  it('skips coturn without URLs', async () => {
    const ice = new ConfiguredIceServers(
      configWith({
        CALL_STUN_URLS: 'stun:a:3478',
        CALL_TURN_SHARED_SECRET: SECRET,
      }),
    );
    expect(await ice.forCall()).toHaveLength(1);
  });
});
