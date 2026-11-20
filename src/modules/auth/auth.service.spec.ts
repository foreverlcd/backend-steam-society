import { createHash } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../generated/prisma/client.js';
import type { Clock } from '../../shared/clock/clock.js';
import { AuthService } from './auth.service.js';
import { LEGAL_TERMS_VERSION } from './legal-terms.js';
import type { PasswordBreachChecker } from './password-breach-checker.js';
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
    termsAcceptedAt: NOW,
    termsVersion: LEGAL_TERMS_VERSION,
    guardianConsentAt: null,
    guardianEmail: null,
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
  const findById = vi.fn();
  const createGuardianConsentToken = vi.fn().mockResolvedValue(undefined);
  const consumeGuardianConsentToken = vi.fn();

  const users = {
    findById,
    createGuardianConsentToken,
    consumeGuardianConsentToken,
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
  const sendEmailChangedNotice = vi.fn().mockResolvedValue(undefined);
  const sendGuardianConsentRequest = vi.fn().mockResolvedValue(undefined);
  const mailer = {
    sendGuardianConsentRequest,
    sendPasswordReset,
    sendEmailVerification,
    sendEmailChangedNotice,
  } as unknown as MailerService;

  const configGet = vi.fn((key: string): unknown =>
    key === 'EMAIL_VERIFICATION_TTL_HOURS' ? 48 : 'false',
  );
  const config = { get: configGet } as unknown as ConfigService;

  const clock: Clock = { now: () => NOW };
  const assertNotBreached = vi.fn().mockResolvedValue(undefined);
  const breachChecker = {
    assertNotBreached,
  } as unknown as PasswordBreachChecker;

  return {
    service: new AuthService(
      users,
      hasher,
      mailer,
      config,
      breachChecker,
      clock,
    ),
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
      assertNotBreached,
      sendEmailChangedNotice,
      findById,
      createGuardianConsentToken,
      consumeGuardianConsentToken,
      sendGuardianConsentRequest,
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
        acceptTerms: true,
      });
      await vi.waitFor(() =>
        expect(mocks.sendEmailVerification).toHaveBeenCalled(),
      );

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
          acceptTerms: true,
        }),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    it('rejects an unknown, used or expired verification token', async () => {
      const { service, mocks } = makeService();
      mocks.consumeEmailVerificationToken.mockResolvedValue({
        status: 'invalid',
      });

      await expect(service.verifyEmail('nope')).rejects.toMatchObject({
        response: { code: 'INVALID_VERIFICATION_TOKEN' },
      });
    });

    it('tells the previous address when an email change is confirmed', async () => {
      const { service, mocks } = makeService();
      mocks.consumeEmailVerificationToken.mockResolvedValue({
        status: 'email_changed',
        userId: 'user-1',
        previousEmail: 'old@example.com',
        newEmail: 'new@example.com',
      });

      await service.verifyEmail('token');
      await vi.waitFor(() =>
        expect(mocks.sendEmailChangedNotice).toHaveBeenCalledWith(
          'old@example.com',
          'new@example.com',
        ),
      );
    });

    it('refuses an email change to an address taken meanwhile', async () => {
      const { service, mocks } = makeService();
      mocks.consumeEmailVerificationToken.mockResolvedValue({
        status: 'email_taken',
      });

      await expect(service.verifyEmail('token')).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
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
        guardianConsentPending: false,
      };

      await expect(
        service.resendEmailVerification(verified),
      ).rejects.toMatchObject({
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
      acceptTerms: true,
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
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('legal consent', () => {
    // NOW is 2026-01-01: born 2012-01-02 is still 13, born 2012-01-01 is 14.
    it('requires guardian consent under 14', async () => {
      const { service, mocks } = makeService();

      await expect(
        service.register({
          email: 'kid@example.com',
          password: TEST_PASSWORD,
          role: 'mentee',
          birthDate: '2012-01-02',
          acceptTerms: true,
        }),
      ).rejects.toMatchObject({
        response: { code: 'GUARDIAN_CONSENT_REQUIRED' },
      });
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('needs the guardian e-mail under 14', async () => {
      const { service, mocks } = makeService();

      await expect(
        service.register({
          email: 'kid@example.com',
          password: TEST_PASSWORD,
          role: 'mentee',
          birthDate: '2012-01-02',
          acceptTerms: true,
          guardianConsent: true,
        }),
      ).rejects.toMatchObject({
        response: { code: 'GUARDIAN_EMAIL_REQUIRED' },
      });
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('rejects the user own address as guardian e-mail', async () => {
      const { service, mocks } = makeService();

      await expect(
        service.register({
          email: 'kid@example.com',
          password: TEST_PASSWORD,
          role: 'mentee',
          birthDate: '2012-01-02',
          acceptTerms: true,
          guardianConsent: true,
          guardianEmail: ' KID@example.com',
        }),
      ).rejects.toMatchObject({
        response: { code: 'GUARDIAN_EMAIL_SAME_AS_USER' },
      });
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('stores the guardian e-mail and sends the consent link', async () => {
      const { service, mocks } = makeService();
      mocks.findByEmail.mockResolvedValue(null);
      mocks.create.mockResolvedValue(
        makeUser({
          id: 'kid-1',
          firstName: 'Ana',
          birthDate: new Date('2012-01-02T00:00:00.000Z'),
          guardianEmail: 'parent@example.com',
        }),
      );

      const created = await service.register({
        email: 'kid@example.com',
        password: TEST_PASSWORD,
        role: 'mentee',
        birthDate: '2012-01-02',
        acceptTerms: true,
        guardianConsent: true,
        guardianEmail: 'Parent@Example.com',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          termsAcceptedAt: NOW,
          termsVersion: LEGAL_TERMS_VERSION,
          guardianEmail: 'parent@example.com',
        }),
      );
      expect(created.guardianConsentPending).toBe(true);
      await vi.waitFor(() =>
        expect(mocks.sendGuardianConsentRequest).toHaveBeenCalledWith(
          'parent@example.com',
          'Ana',
          expect.any(String),
          7,
        ),
      );
      const token = mocks.sendGuardianConsentRequest.mock.calls[0][2];
      const [userId, tokenHash, expiresAt, corrected] =
        mocks.createGuardianConsentToken.mock.calls[0];
      expect(userId).toBe('kid-1');
      expect(tokenHash).not.toBe(token);
      expect(expiresAt).toEqual(new Date('2026-01-08T00:00:00.000Z'));
      expect(corrected).toBeUndefined();
    });

    it('does not ask for guardian consent from the 14th birthday', async () => {
      const { service, mocks } = makeService();
      mocks.findByEmail.mockResolvedValue(null);
      mocks.create.mockResolvedValue(makeUser());

      await service.register({
        email: 'teen@example.com',
        password: TEST_PASSWORD,
        role: 'mentee',
        birthDate: '2012-01-01',
        acceptTerms: true,
        guardianEmail: 'parent@example.com',
      });

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          termsAcceptedAt: NOW,
          termsVersion: LEGAL_TERMS_VERSION,
          guardianEmail: null,
        }),
      );
      expect(mocks.sendGuardianConsentRequest).not.toHaveBeenCalled();
    });
  });

  describe('guardian consent', () => {
    const pendingKid = {
      id: 'kid-1',
      email: 'kid@example.com',
      role: 'mentee' as const,
      status: 'active' as const,
      firstName: 'Ana',
      lastName: null,
      birthDate: new Date('2012-01-02T00:00:00.000Z'),
      emailVerified: true,
      mfaEnabled: false,
      guardianConsentPending: true,
    };

    it('confirms with a valid link', async () => {
      const { service, mocks } = makeService();
      mocks.consumeGuardianConsentToken.mockResolvedValue(true);

      await service.confirmGuardianConsent('raw-token');

      const [tokenHash, now] = mocks.consumeGuardianConsentToken.mock.calls[0];
      expect(tokenHash).not.toBe('raw-token');
      expect(now).toBe(NOW);
    });

    it('rejects an unknown, expired or used link', async () => {
      const { service, mocks } = makeService();
      mocks.consumeGuardianConsentToken.mockResolvedValue(false);

      await expect(
        service.confirmGuardianConsent('raw-token'),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_GUARDIAN_TOKEN' },
      });
    });

    it('resends to the stored guardian address', async () => {
      const { service, mocks } = makeService();
      mocks.findById.mockResolvedValue(
        makeUser({ id: 'kid-1', guardianEmail: 'parent@example.com' }),
      );

      await service.resendGuardianConsent(pendingKid, {});

      expect(mocks.createGuardianConsentToken).toHaveBeenCalledWith(
        'kid-1',
        expect.any(String),
        expect.any(Date),
        undefined,
      );
      expect(mocks.sendGuardianConsentRequest).toHaveBeenCalledWith(
        'parent@example.com',
        'Ana',
        expect.any(String),
        7,
      );
    });

    it('resends to a corrected guardian address', async () => {
      const { service, mocks } = makeService();
      mocks.findById.mockResolvedValue(
        makeUser({ id: 'kid-1', guardianEmail: 'typo@example.com' }),
      );

      await service.resendGuardianConsent(pendingKid, {
        guardianEmail: 'Parent@Example.com',
      });

      expect(mocks.createGuardianConsentToken).toHaveBeenCalledWith(
        'kid-1',
        expect.any(String),
        expect.any(Date),
        'parent@example.com',
      );
      expect(mocks.sendGuardianConsentRequest).toHaveBeenCalledWith(
        'parent@example.com',
        'Ana',
        expect.any(String),
        7,
      );
    });

    it('does not resend when consent is not pending', async () => {
      const { service, mocks } = makeService();

      await expect(
        service.resendGuardianConsent(
          { ...pendingKid, guardianConsentPending: false },
          {},
        ),
      ).rejects.toMatchObject({
        response: { code: 'GUARDIAN_CONSENT_NOT_PENDING' },
      });
      expect(mocks.sendGuardianConsentRequest).not.toHaveBeenCalled();
    });
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
