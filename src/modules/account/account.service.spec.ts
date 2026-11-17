import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../shared/clock/clock.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../shared/personal-data/personal-data.registry.js';
import type { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AccountSecurityService } from '../auth/account-security.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AccountService } from './account.service.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER: AuthUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'mentee',
  status: 'active',
  firstName: null,
  lastName: null,
  birthDate: null,
  emailVerified: true,
  mfaEnabled: false,
};
const PROOF = { password: 'test-only-password' };

function makeService(contributors: PersonalDataContributor[]) {
  const registry = new PersonalDataRegistry();
  contributors.forEach((c) => registry.register(c));
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<void>) =>
      work(tx),
    ),
  } as unknown as PrismaService;
  const assertStepUp = vi.fn().mockResolvedValue(undefined);
  const accountSecurity = { assertStepUp } as unknown as AccountSecurityService;
  const clock: Clock = { now: () => NOW };
  return {
    service: new AccountService(registry, prisma, accountSecurity, clock),
    tx,
    assertStepUp,
  };
}

function contributor(
  section: string,
  eraseOrder: number,
  calls: string[],
  overrides: Partial<PersonalDataContributor> = {},
): PersonalDataContributor {
  return {
    section,
    eraseOrder,
    exportFor: vi.fn().mockResolvedValue({ from: section }),
    erase: vi.fn(() => {
      calls.push(section);
      return Promise.resolve();
    }),
    ...overrides,
  };
}

describe('AccountService', () => {
  it('exports one section per contributor', async () => {
    const calls: string[] = [];
    const { service } = makeService([
      contributor('account', 100, calls),
      contributor('profile', 30, calls),
    ]);

    await expect(service.exportData(USER)).resolves.toEqual({
      format: 'steam-society-export/v1',
      exportedAt: NOW,
      userId: 'user-1',
      sections: { account: { from: 'account' }, profile: { from: 'profile' } },
    });
  });

  it('erases in order, inside one transaction, after the step-up', async () => {
    const calls: string[] = [];
    const { service, tx, assertStepUp } = makeService([
      contributor('account', 100, calls),
      contributor('bookings', 10, calls),
    ]);

    await service.deleteAccount(USER, PROOF);

    expect(assertStepUp).toHaveBeenCalledWith(USER, PROOF);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(calls).toEqual(['bookings', 'account']);
  });

  it('erases nothing when the step-up fails', async () => {
    const calls: string[] = [];
    const { service, assertStepUp } = makeService([
      contributor('account', 100, calls),
    ]);
    assertStepUp.mockRejectedValue(new UnauthorizedException());

    await expect(service.deleteAccount(USER, PROOF)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(calls).toEqual([]);
  });

  it('erases nothing when a module refuses', async () => {
    const calls: string[] = [];
    const { service } = makeService([
      contributor('account', 100, calls),
      contributor('bookings', 10, calls, {
        assertErasable: () => Promise.reject(new ConflictException()),
      }),
    ]);

    await expect(service.deleteAccount(USER, PROOF)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(calls).toEqual([]);
  });
});
