import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../shared/http/public.decorator.js';
import { ROLES_KEY } from '../../shared/http/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import type { UserRepository } from './user.repository.js';

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
    );

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects requests without a session', async () => {
    const users = { findById: vi.fn() } as unknown as UserRepository;
    const guard = new SessionAuthGuard(reflectorReturning({}), users);

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
    const guard = new SessionAuthGuard(reflectorReturning({}), users);

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
    const guard = new SessionAuthGuard(reflectorReturning({}), users);
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
