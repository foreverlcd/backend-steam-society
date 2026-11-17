import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  emailTaken,
  hashToken,
  invalidCredentials,
  normalizeEmail,
} from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { MailerService } from './mailer.service.js';
import { invalidMfaCode, MfaService } from './mfa.service.js';
import { PasswordBreachChecker } from './password-breach-checker.js';
import { PasswordHasher } from './password-hasher.service.js';
import { SessionRepository, type ActiveSession } from './session.repository.js';
import { UserRepository } from './user.repository.js';

/** Proof the account owner is present: password, plus 2FA code if enabled. */
export interface StepUpProof {
  password: string;
  code?: string;
}

/**
 * Self-service account security (F2): active sessions, password change and
 * e-mail change. Sensitive changes ask for the password again (and the 2FA
 * code when enabled), revoke the other sessions and notify by e-mail.
 */
@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly breachChecker: PasswordBreachChecker,
    private readonly mfa: MfaService,
    private readonly mailer: MailerService,
    private readonly configService: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listSessions(user: AuthUser, currentSid: string): Promise<ActiveSession[]> {
    return this.sessions.listForUser(user.id, currentSid, this.clock.now());
  }

  async revokeSession(user: AuthUser, publicId: string): Promise<void> {
    if (!(await this.sessions.revoke(user.id, publicId))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }
  }

  revokeOtherSessions(user: AuthUser, currentSid: string): Promise<number> {
    return this.sessions.revokeAll(user.id, currentSid);
  }

  async changePassword(
    user: AuthUser,
    proof: StepUpProof,
    newPassword: string,
    currentSid: string,
  ): Promise<void> {
    await this.assertStepUp(user, proof);
    await this.breachChecker.assertNotBreached(newPassword);
    await this.users.updatePassword(
      user.id,
      await this.passwordHasher.hash(newPassword),
    );
    await this.sessions.revokeAll(user.id, currentSid);
    this.notify('Password changed notice', () =>
      this.mailer.sendPasswordChangedNotice(user.email),
    );
  }

  /** Sends a confirmation link to the new address; nothing changes until it is used. */
  async requestEmailChange(
    user: AuthUser,
    proof: StepUpProof,
    newEmailInput: string,
  ): Promise<void> {
    await this.assertStepUp(user, proof);
    const newEmail = normalizeEmail(newEmailInput);
    if (newEmail === user.email) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'EMAIL_UNCHANGED',
        message: 'That is already your email',
      });
    }
    if (await this.users.findByEmail(newEmail)) {
      throw emailTaken();
    }

    const token = randomBytes(32).toString('base64url');
    const validHours = Number(
      this.configService.get<number>('EMAIL_VERIFICATION_TTL_HOURS') ?? 48,
    );
    await this.users.createEmailVerificationToken(
      user.id,
      hashToken(token),
      new Date(this.clock.now().getTime() + validHours * 3_600_000),
      newEmail,
    );
    await this.mailer.sendEmailChangeVerification(newEmail, token, validHours);
    this.notify('Email change requested notice', () =>
      this.mailer.sendEmailChangeRequestedNotice(user.email),
    );
  }

  /** Re-checks the password (and the 2FA code when enabled) before a sensitive change. */
  async assertStepUp(user: AuthUser, proof: StepUpProof): Promise<void> {
    const account = await this.users.findById(user.id);
    const passwordOk =
      !!account?.passwordHash &&
      (await this.passwordHasher.verify(account.passwordHash, proof.password));
    if (!passwordOk) throw invalidCredentials();

    if (!user.mfaEnabled) return;
    if (!proof.code) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MFA_CODE_REQUIRED',
        message: 'Enter the code from your authenticator app',
      });
    }
    if (!(await this.mfa.verifySecondFactor(user.id, { code: proof.code }))) {
      throw invalidMfaCode();
    }
  }

  /** Security notices are best effort: the change already happened. */
  private notify(what: string, send: () => Promise<void>): void {
    void send().catch((error) => {
      this.logger.error(
        `${what} failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    });
  }
}
