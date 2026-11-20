import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../shared/http/public.decorator.js';
import { REQUIRES_VERIFIED_EMAIL_KEY } from '../../shared/http/account-policy.decorators.js';
import { ROLES_KEY } from '../../shared/http/roles.decorator.js';
import { AccountPolicyGuard } from './account-policy.guard.js';
import type { MfaService } from './mfa.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import type { Clock } from '../../shared/clock/clock.js';
import {
  isGuardianConsentPending,
  type UserRepository,
} from './user.repository.js';

const clock: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(values: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) => values[key]),
  } as unknown as Reflector;
}

describe('SessionAuthGuard', () => {
  it('allows public routes without loading a user', async () => {
    const findById = vi.fn();
    const users = { findById } as unknown as UserRepository;
    const guard = new SessionAuthGuard(
      reflectorReturning({ [IS_PUBLIC_KEY]: true }),
      users,
      clock,
    );

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects requests without a session', async () => {
    const users = { findById: vi.fn() } as unknown as UserRepository;
    const guard = new SessionAuthGuard(reflectorReturning({}), users, clock);

    await expect(
      guard.canActivate(contextFor({ session: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('destroys the session and rejects suspended users', async () => {
    const destroy = vi.fn();
    const users = {
      findById: vi.fn().mockResolvedValue({
        id: 'user-1',
        status: 'suspended',
        deletedAt: null,
      }),
    } as unknown as UserRepository;
    const guard = new SessionAuthGuard(reflectorReturning({}), users, clock);

    await expect(
      guard.canActivate(contextFor({ session: { userId: 'user-1', destroy } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(destroy).toHaveBeenCalled();
  });

  it('attaches the authenticated user', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'mentee',
      status: 'active',
      firstName: null,
      lastName: null,
      birthDate: null,
      deletedAt: null,
    };
    const users = {
      findById: vi.fn().mockResolvedValue(user),
    } as unknown as UserRepository;
    const guard = new SessionAuthGuard(reflectorReturning({}), users, clock);
    const request: Record<string, unknown> = {
      session: { userId: 'user-1' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user-1', role: 'mentee' });
  });
});

describe('RolesGuard', () => {
  it('allows routes without role requirements', () => {
    const guard = new RolesGuard(reflectorReturning({}));

    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('allows a user with an accepted role', () => {
    const guard = new RolesGuard(
      reflectorReturning({ [ROLES_KEY]: ['admin'] }),
    );

    expect(guard.canActivate(contextFor({ user: { role: 'admin' } }))).toBe(
      true,
    );
  });

  it('rejects a user with a different role', () => {
    const guard = new RolesGuard(
      reflectorReturning({ [ROLES_KEY]: ['admin'] }),
    );

    expect(() =>
      guard.canActivate(contextFor({ user: { role: 'mentee' } })),
    ).toThrow(ForbiddenException);
  });
});

describe('AccountPolicyGuard', () => {
  const mfa = { isRequiredFor: () => false } as unknown as MfaService;
  const verifiedMentee = {
    id: 'kid-1',
    role: 'mentee',
    emailVerified: true,
    mfaEnabled: false,
    guardianConsentPending: false,
  };

  it('blocks verified-email routes while guardian consent is pending', () => {
    const guard = new AccountPolicyGuard(
      reflectorReturning({ [REQUIRES_VERIFIED_EMAIL_KEY]: true }),
      mfa,
    );

    expect(() =>
      guard.canActivate(
        contextFor({
          user: { ...verifiedMentee, guardianConsentPending: true },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'GUARDIAN_CONSENT_PENDING' }),
      }),
    );
  });

  it('asks for the e-mail first when both are missing', () => {
    const guard = new AccountPolicyGuard(
      reflectorReturning({ [REQUIRES_VERIFIED_EMAIL_KEY]: true }),
      mfa,
    );

    expect(() =>
      guard.canActivate(
        contextFor({
          user: {
            ...verifiedMentee,
            emailVerified: false,
            guardianConsentPending: true,
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }),
      }),
    );
  });

  it('lets a pending account use other routes and a consented one book', () => {
    const open = new AccountPolicyGuard(reflectorReturning({}), mfa);
    expect(
      open.canActivate(
        contextFor({
          user: { ...verifiedMentee, guardianConsentPending: true },
        }),
      ),
    ).toBe(true);

    const gated = new AccountPolicyGuard(
      reflectorReturning({ [REQUIRES_VERIFIED_EMAIL_KEY]: true }),
      mfa,
    );
    expect(gated.canActivate(contextFor({ user: verifiedMentee }))).toBe(true);
  });
});

describe('isGuardianConsentPending', () => {
  const kid = {
    birthDate: new Date('2012-01-02T00:00:00.000Z'),
    guardianEmail: 'parent@example.com',
    guardianConsentAt: null,
  };

  it('is pending under 14 until the adult confirms', () => {
    expect(isGuardianConsentPending(kid, clock.now())).toBe(true);
    expect(
      isGuardianConsentPending(
        { ...kid, guardianConsentAt: clock.now() },
        clock.now(),
      ),
    ).toBe(false);
  });

  it('stops being pending on the 14th birthday', () => {
    expect(
      isGuardianConsentPending(kid, new Date('2026-01-01T23:59:59.000Z')),
    ).toBe(true);
    expect(
      isGuardianConsentPending(kid, new Date('2026-01-02T00:00:00.000Z')),
    ).toBe(false);
  });

  it('never applies without a guardian address', () => {
    expect(
      isGuardianConsentPending({ ...kid, guardianEmail: null }, clock.now()),
    ).toBe(false);
  });
});
