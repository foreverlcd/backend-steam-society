import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../shared/clock/clock.js';
import { AccountSecurityService } from './account-security.service.js';
import type { AuthUser } from './auth.types.js';
import type { MailerService } from './mailer.service.js';
import type { MfaService } from './mfa.service.js';
import type { PasswordBreachChecker } from './password-breach-checker.js';
import type { PasswordHasher } from './password-hasher.service.js';
import type { SessionRepository } from './session.repository.js';
import type { UserRepository } from './user.repository.js';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const TEST_PASSWORD = 'test-only-current-password';
const NEW_TEST_PASSWORD = 'test-only-brand-new-password';

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

describe('AccountSecurityService', () => {
  const mocks = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updatePassword: vi.fn(),
    createEmailVerificationToken: vi.fn(),
    revokeAll: vi.fn(),
    verify: vi.fn(),
    hash: vi.fn(),
    assertNotBreached: vi.fn(),
    verifySecondFactor: vi.fn(),
    sendPasswordChangedNotice: vi.fn(),
    sendEmailChangeVerification: vi.fn(),
    sendEmailChangeRequestedNotice: vi.fn(),
  };
  let service: AccountSecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findById.mockResolvedValue({ passwordHash: '$argon2id$x' });
    mocks.findByEmail.mockResolvedValue(null);
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue('$argon2id$new');
    mocks.assertNotBreached.mockResolvedValue(undefined);
    mocks.revokeAll.mockResolvedValue(2);
    for (const send of [
      mocks.sendPasswordChangedNotice,
      mocks.sendEmailChangeVerification,
      mocks.sendEmailChangeRequestedNotice,
    ]) {
      send.mockResolvedValue(undefined);
    }
    const clock: Clock = { now: () => NOW };
    service = new AccountSecurityService(
      mocks as unknown as UserRepository,
      mocks as unknown as SessionRepository,
      mocks as unknown as PasswordHasher,
      mocks as unknown as PasswordBreachChecker,
      mocks as unknown as MfaService,
      mocks as unknown as MailerService,
      { get: () => 48 } as unknown as ConfigService,
      clock,
    );
  });

  it('changes the password, keeps only the current session and notifies', async () => {
    await service.changePassword(
      user(),
      { password: TEST_PASSWORD },
      NEW_TEST_PASSWORD,
      'sid-1',
    );

    expect(mocks.assertNotBreached).toHaveBeenCalledWith(NEW_TEST_PASSWORD);
    expect(mocks.updatePassword).toHaveBeenCalledWith(
      'user-1',
      '$argon2id$new',
      'sid-1',
    );
    await vi.waitFor(() =>
      expect(mocks.sendPasswordChangedNotice).toHaveBeenCalledWith(
        'ana@example.com',
      ),
    );
  });

  it('rejects a wrong current password without changing anything', async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(
      service.changePassword(
        user(),
        { password: 'wrong' },
        NEW_TEST_PASSWORD,
        'sid-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    expect(mocks.updatePassword).not.toHaveBeenCalled();
  });

  it('asks for the 2FA code when the account has it, and checks it', async () => {
    const withMfa = user({ mfaEnabled: true });
    await expect(
      service.changePassword(
        withMfa,
        { password: TEST_PASSWORD },
        NEW_TEST_PASSWORD,
        's',
      ),
    ).rejects.toMatchObject({ response: { code: 'MFA_CODE_REQUIRED' } });

    mocks.verifySecondFactor.mockResolvedValue(false);
    await expect(
      service.changePassword(
        withMfa,
        { password: TEST_PASSWORD, code: '000000' },
        NEW_TEST_PASSWORD,
        's',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_MFA_CODE' } });
    expect(mocks.updatePassword).not.toHaveBeenCalled();
  });

  it('sends the change link to the new address and warns the old one', async () => {
    await service.requestEmailChange(
      user(),
      { password: TEST_PASSWORD },
      '  New@Example.com ',
    );

    const [userId, tokenHash, expiresAt, newEmail] =
      mocks.createEmailVerificationToken.mock.calls[0];
    expect([userId, newEmail]).toEqual(['user-1', 'new@example.com']);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toEqual(new Date(NOW.getTime() + 48 * 3_600_000));
    expect(mocks.sendEmailChangeVerification).toHaveBeenCalledWith(
      'new@example.com',
      expect.any(String),
      48,
    );
    await vi.waitFor(() =>
      expect(mocks.sendEmailChangeRequestedNotice).toHaveBeenCalledWith(
        'ana@example.com',
      ),
    );
  });

  it('refuses the same address or one already in use', async () => {
    await expect(
      service.requestEmailChange(
        user(),
        { password: TEST_PASSWORD },
        'ANA@example.com',
      ),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_UNCHANGED' } });

    mocks.findByEmail.mockResolvedValue({ id: 'other' });
    await expect(
      service.requestEmailChange(
        user(),
        { password: TEST_PASSWORD },
        'taken@example.com',
      ),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    expect(mocks.createEmailVerificationToken).not.toHaveBeenCalled();
  });
});
