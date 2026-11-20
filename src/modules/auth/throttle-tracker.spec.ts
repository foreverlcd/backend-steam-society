import { describe, expect, it } from 'vitest';
import { throttleTracker } from './throttle-tracker.js';

const signedIn = { userId: 'attacker-1' };

describe('throttleTracker', () => {
  it('keys login by IP and target e-mail even with a session cookie', () => {
    expect(
      throttleTracker({
        originalUrl: '/v1/auth/login',
        ip: '1.2.3.4',
        session: signedIn,
        body: { email: ' Victim@Example.com ' },
      }),
    ).toBe('1.2.3.4:victim@example.com');
  });

  it('keys password reset requests the same way', () => {
    expect(
      throttleTracker({
        originalUrl: '/v1/auth/password/forgot?x=1',
        ip: '1.2.3.4',
        session: signedIn,
        body: { email: 'victim@example.com' },
      }),
    ).toBe('1.2.3.4:victim@example.com');
  });

  it('keys registration by IP only', () => {
    expect(
      throttleTracker({
        originalUrl: '/v1/auth/register',
        ip: '1.2.3.4',
        body: { email: 'any@example.com' },
      }),
    ).toBe('register:1.2.3.4');
  });

  it('keys second-factor guesses by the pending account', () => {
    expect(
      throttleTracker({
        originalUrl: '/v1/auth/login/mfa',
        ip: '1.2.3.4',
        session: { pendingMfa: { userId: 'victim-1' } },
      }),
    ).toBe('mfa:victim-1');
  });

  it('keys other requests by the signed-in account', () => {
    expect(
      throttleTracker({
        originalUrl: '/v1/bookings',
        ip: '1.2.3.4',
        session: signedIn,
      }),
    ).toBe('user:attacker-1');
  });
});
