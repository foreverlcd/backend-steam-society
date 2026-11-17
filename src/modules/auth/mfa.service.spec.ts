import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../shared/clock/clock.js';
import type { AuthUser } from './auth.types.js';
import type { MfaRepository, TotpState } from './mfa.repository.js';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  MfaService,
  RECOVERY_CODE_COUNT,
} from './mfa.service.js';
import type { PasswordHasher } from './password-hasher.service.js';
import { SecretBox } from './secret-box.js';
import { totpCodeForStep, totpTimeStep } from './totp.js';
import type { UserRepository } from './user.repository.js';

const NOW = new Date('2026-11-17T12:00:00.000Z');

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    role: 'mentee',
    status: 'active',
    firstName: null,
    lastName: null,
    birthDate: null,
    emailVerified: true,
    mfaEnabled: false,
    ...overrides,
  };
}

/** In-memory MfaRepository with the same replay semantics as the SQL one. */
class FakeMfaRepository {
  totp: TotpState | null = null;
  codes = new Map<string, Date | null>();
  enable = vi.fn(async (_userId: string, at: Date, hashes: string[]) => {
    this.totp = { ...this.totp!, confirmedAt: at };
    this.codes = new Map(hashes.map((hash) => [hash, null]));
  });
  disableTotp = vi.fn(async () => {
    this.totp = null;
    this.codes.clear();
  });

  findTotp = async () => this.totp;
  saveUnconfirmedTotp = async (_userId: string, secretCiphertext: string) => {
    this.totp = { secretCiphertext, confirmedAt: null, lastUsedTimeStep: null };
  };
  acceptTimeStep = async (_userId: string, step: number) => {
    if (!this.totp) return false;
    if (this.totp.lastUsedTimeStep !== null && step <= this.totp.lastUsedTimeStep) {
      return false;
    }
    this.totp.lastUsedTimeStep = step;
    return true;
  };
  enableTotp = (userId: string, at: Date, hashes: string[]) =>
    this.enable(userId, at, hashes);
  replaceRecoveryCodes = async (_userId: string, hashes: string[]) => {
    this.codes = new Map(hashes.map((hash) => [hash, null]));
  };
  consumeRecoveryCode = async (_userId: string, hash: string, at: Date) => {
    if (!this.codes.has(hash) || this.codes.get(hash) !== null) return false;
    this.codes.set(hash, at);
    return true;
  };
  countUnusedRecoveryCodes = async () =>
    [...this.codes.values()].filter((usedAt) => usedAt === null).length;
}

describe('MfaService', () => {
  let repo: FakeMfaRepository;
  let service: MfaService;
  let now: Date;
  const verifyPassword = vi.fn();

  beforeEach(() => {
    repo = new FakeMfaRepository();
    now = NOW;
    const secretBox = new SecretBox({
      get: () => randomBytes(32).toString('base64'),
    } as unknown as ConfigService);
    const users = {
      findById: async () => ({ passwordHash: '$argon2id$x' }),
    } as unknown as UserRepository;
    const hasher = { verify: verifyPassword } as unknown as PasswordHasher;
    const clock: Clock = { now: () => now };
    service = new MfaService(
      repo as unknown as MfaRepository,
      users,
      secretBox,
      hasher,
      clock,
    );
  });

  async function enroll(): Promise<{ secret: string; codes: string[] }> {
    const { secret } = await service.startTotpSetup(user());
    const codes = await service.confirmTotpSetup(
      user(),
      totpCodeForStep(secret, totpTimeStep(now)),
    );
    return { secret, codes };
  }

  it('enrolls with a valid first code and returns 10 one-time recovery codes', async () => {
    const setup = await service.startTotpSetup(user());
    expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
    expect(repo.totp?.secretCiphertext).not.toContain(setup.secret);

    const codes = await service.confirmTotpSetup(
      user(),
      totpCodeForStep(setup.secret, totpTimeStep(now)),
    );
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(repo.enable).toHaveBeenCalledWith('user-1', NOW, codes.map(hashRecoveryCode));
  });

  it('rejects a wrong first code', async () => {
    await service.startTotpSetup(user());
    await expect(service.confirmTotpSetup(user(), '000000')).rejects.toMatchObject({
      response: { code: 'INVALID_MFA_CODE' },
    });
    expect(repo.enable).not.toHaveBeenCalled();
  });

  it('asks to start the setup before confirming', async () => {
    await expect(service.confirmTotpSetup(user(), '123456')).rejects.toMatchObject({
      response: { code: 'MFA_SETUP_REQUIRED' },
    });
  });

  it('refuses a second setup once enabled', async () => {
    await expect(service.startTotpSetup(user({ mfaEnabled: true }))).rejects.toMatchObject({
      response: { code: 'MFA_ALREADY_ENABLED' },
    });
  });

  it('accepts a login code once: the same code cannot be replayed', async () => {
    const { secret } = await enroll();
    now = new Date(NOW.getTime() + 60_000);
    const code = totpCodeForStep(secret, totpTimeStep(now));

    expect(await service.verifySecondFactor('user-1', { code })).toBe(true);
    expect(await service.verifySecondFactor('user-1', { code })).toBe(false);
  });

  it('accepts each recovery code exactly once, in any format', async () => {
    const { codes } = await enroll();
    const lowerNoDash = codes[0].toLowerCase().replace('-', '');

    expect(await service.verifySecondFactor('user-1', { recoveryCode: lowerNoDash })).toBe(true);
    expect(await service.verifySecondFactor('user-1', { recoveryCode: codes[0] })).toBe(false);
    expect(await service.getStatus(user({ mfaEnabled: true }))).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: RECOVERY_CODE_COUNT - 1,
    });
  });

  it('never verifies against an unconfirmed factor', async () => {
    const { secret } = await service.startTotpSetup(user());
    const code = totpCodeForStep(secret, totpTimeStep(now));
    expect(await service.verifySecondFactor('user-1', { code })).toBe(false);
  });

  it('requires 2FA for admins and forbids turning it off', async () => {
    expect(service.isRequiredFor('admin')).toBe(true);
    expect(service.isRequiredFor('mentor')).toBe(false);
    await expect(
      service.disable(user({ role: 'admin', mfaEnabled: true }), 'pw', '123456'),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED_FOR_ROLE' } });
  });

  it('disables only with the right password and a fresh code', async () => {
    const { secret } = await enroll();
    now = new Date(NOW.getTime() + 60_000);
    const code = totpCodeForStep(secret, totpTimeStep(now));

    verifyPassword.mockResolvedValueOnce(false);
    await expect(
      service.disable(user({ mfaEnabled: true }), 'wrong', code),
    ).rejects.toMatchObject({ response: { code: 'INVALID_MFA_CODE' } });

    verifyPassword.mockResolvedValueOnce(true);
    await service.disable(user({ mfaEnabled: true }), 'right', code);
    expect(repo.disableTotp).toHaveBeenCalled();
  });

  it('generates recovery codes as XXXXX-XXXXX in base32', () => {
    for (const code of generateRecoveryCodes()) {
      expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    }
  });
});
