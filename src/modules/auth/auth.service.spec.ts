import { createHash } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../generated/prisma/client.js';
import type { Clock } from '../../shared/clock/clock.js';
import { AuthService } from './auth.service.js';
import { MailerService } from './mailer.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import {
  ResetTokenAlreadyUsedError,
  UserRepository,
} from './user.repository.js';

// Fixture value for the test-only fake users below.
const TEST_PASSWORD = 'test-only-correct-horse';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: '$argon2id$hash',
    role: 'mentee',
    status: 'active',
    firstName: null,
    lastName: null,
    birthDate: new Date('2000-01-01T00:00:00.000Z'),
    timezone: 'America/Lima',
    locale: 'es',
    emailVerifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeService() {
  const findByEmail = vi.fn();
  const create = vi.fn();
  const createResetToken = vi.fn();
  const findValidResetToken = vi.fn();
  const consumeResetToken = vi.fn();
  const createEmailVerificationToken = vi.fn().mockResolvedValue(undefined);
  const consumeEmailVerificationToken = vi.fn();

  const users = {
    findByEmail,
    create,
    createResetToken,
    findValidResetToken,
    consumeResetToken,
    createEmailVerificationToken,
    consumeEmailVerificationToken,
  } as unknown as UserRepository;

  const hash = vi.fn().mockResolvedValue('$argon2id$new-hash');
  const verify = vi.fn();
  const verifyDummy = vi.fn().mockResolvedValue(false);

  const hasher = { hash, verify, verifyDummy } as unknown as PasswordHasher;

  const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
  const sendEmailVerification = vi.fn().mockResolvedValue(undefined);
  const mailer = {
    sendPasswordReset,
    sendEmailVerification,
  } as unknown as MailerService;

  const configGet = vi.fn(
    (key: string): unknown =>
      key === 'EMAIL_VERIFICATION_TTL_HOURS' ? 48 : 'false',
  );
  const config = { get: configGet } as unknown as ConfigService;

  const clock: Clock = { now: () => NOW };

  return {
    service: new AuthService(users, hasher, mailer, config, clock),
    mocks: {
      findByEmail,
      create,
      createResetToken,
      findValidResetToken,
      consumeResetToken,
      hash,
      verify,
      verifyDummy,
      sendPasswordReset,
      sendEmailVerification,
      createEmailVerificationToken,
      consumeEmailVerificationToken,
      configGet,
    },
  };
}

describe('AuthService', () => {
  describe('email verification', () => {
    it('sends a verification link on register, storing only the token hash', async () => {
      const { service, mocks } = makeService();
      mocks.findByEmail.mockResolvedValue(null);
      mocks.create.mockResolvedValue(makeUser());

      const user = await service.register({
        email: 'user@example.com',
        password: TEST_PASSWORD,
        role: 'mentee',
        birthDate: '2000-01-01',
      });
      await vi.waitFor(() => expect(mocks.sendEmailVerification).toHaveBeenCalled());

      expect(user.emailVerified).toBe(false);
      const [, token, hours] = mocks.sendEmailVerification.mock.calls[0];
      const [userId, tokenHash, expiresAt] =
        mocks.createEmailVerificationToken.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(hours).toBe(48);
      expect(expiresAt).toEqual(new Date(NOW.getTime() + 48 * 3_600_000));
    });

    it('still creates the account when the verification email fails', async () => {
      const { service, mocks } = makeService();
      mocks.findByEmail.mockResolvedValue(null);
      mocks.create.mockResolvedValue(makeUser());
      mocks.sendEmailVerification.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.register({
          email: 'user@example.com',
          password: TEST_PASSWORD,
          role: 'mentee',
          birthDate: '2000-01-01',
        }),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    it('rejects an unknown, used or expired verification token', async () => {
      const { service, mocks } = makeService();
      mocks.consumeEmailVerificationToken.mockResolvedValue(false);

      await expect(service.verifyEmail('nope')).rejects.toMatchObject({
        response: { code: 'INVALID_VERIFICATION_TOKEN' },
      });
    });

    it('does not resend when the email is already verified', async () => {
      const { service } = makeService();
      const verified = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'mentee' as const,
        status: 'active' as const,
        firstName: null,
        lastName: null,
        birthDate: null,
        emailVerified: true,
        mfaEnabled: false,
      };

      await expect(service.resendEmailVerification(verified)).rejects.toMatchObject({
        response: { code: 'EMAIL_ALREADY_VERIFIED' },
      });
    });
  });

  it('normalizes the email before looking up or storing the user', async () => {
    const { service, mocks } = makeService();
    mocks.findByEmail.mockResolvedValue(null);
    mocks.create.mockResolvedValue(makeUser());

    await service.register({
      email: '  Mixed@Example.COM ',
      password: TEST_PASSWORD,
      role: 'mentee',
      birthDate: '2000-01-01',
    });

    expect(mocks.findByEmail).toHaveBeenCalledWith('mixed@example.com');
    expect(mocks.hash).toHaveBeenCalledWith(TEST_PASSWORD);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mixed@example.com' }),
    );
  });

  it('rejects a future birth date', async () => {
    const { service } = makeService();

    await expect(
      service.register({
        email: 'user@example.com',
        password: TEST_PASSWORD,
        role: 'mentee',
        birthDate: '2030-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runs a dummy verification and fails with a generic error for unknown emails', async () => {
    const { service, mocks } = makeService();
    mocks.findByEmail.mockResolvedValue(null);

    await expect(
      service.login('unknown@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.verifyDummy).toHaveBeenCalledWith('wrong-password');
  });

  it('does not allow suspended users to log in', async () => {
    const { service, mocks } = makeService();
    mocks.findByEmail.mockResolvedValue(makeUser({ status: 'suspended' }));

    await expect(
      service.login('user@example.com', TEST_PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.verifyDummy).toHaveBeenCalledWith(TEST_PASSWORD);
  });

  it('stores only the SHA-256 hash of the reset token and sends the raw token', async () => {
    const { service, mocks } = makeService();
    mocks.findByEmail.mockResolvedValue(makeUser());
    mocks.createResetToken.mockResolvedValue(undefined);

    await service.requestPasswordReset('user@example.com');

    const [, storedHash, expiresAt] = mocks.createResetToken.mock.calls[0];
    const rawToken = mocks.sendPasswordReset.mock.calls[0][1];

    expect(storedHash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(storedHash).not.toBe(rawToken);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(60 * 60 * 1000);
  });

  it('maps an already-used reset token to a generic invalid-token error', async () => {
    const { service, mocks } = makeService();
    mocks.findValidResetToken.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
    });
    mocks.consumeResetToken.mockRejectedValue(new ResetTokenAlreadyUsedError());

    await expect(
      service.resetPassword('raw-token', 'new-correct-horse-battery'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the __Host- cookie name when secure cookies are enabled', () => {
    const { service, mocks } = makeService();
    mocks.configGet.mockReturnValue('true');

    expect(service.getSessionCookieName()).toBe('__Host-sid');
    expect(service.isSecureSessionCookie()).toBe(true);
  });

  it('uses the plain cookie name for local HTTP development', () => {
    const { service } = makeService();

    expect(service.getSessionCookieName()).toBe('sid');
    expect(service.isSecureSessionCookie()).toBe(false);
  });
});
