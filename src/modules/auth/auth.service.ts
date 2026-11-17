import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { resolveSessionCookieName } from '../../shared/http/session-cookie.js';
import type { AuthUser } from './auth.types.js';
import type { RegisterInput } from './auth.schemas.js';
import { MailerService } from './mailer.service.js';
import { PasswordBreachChecker } from './password-breach-checker.js';
import { PasswordHasher } from './password-hasher.service.js';
import {
  ResetTokenAlreadyUsedError,
  UserRepository,
  toAuthUser,
} from './user.repository.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Time the user has to type the second factor after a correct password. */
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Enough to recognise a browser in "Sesiones activas"; never trusted. */
const USER_AGENT_MAX_LENGTH = 200;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly mailer: MailerService,
    private readonly configService: ConfigService,
    private readonly breachChecker: PasswordBreachChecker,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const email = normalizeEmail(input.email);
    const birthDate = new Date(`${input.birthDate}T00:00:00.000Z`);

    if (birthDate.getTime() > this.clock.now().getTime()) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_BIRTH_DATE',
        message: 'Birth date cannot be in the future',
      });
    }

    if (await this.users.findByEmail(email)) {
      throw emailTaken();
    }

    await this.breachChecker.assertNotBreached(input.password);
    const passwordHash = await this.passwordHasher.hash(input.password);

    try {
      const user = await this.users.create({
        email,
        passwordHash,
        role: input.role,
        birthDate,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      // The account exists even if the e-mail provider is down; the user can
      // ask for a new link later (POST /auth/email/resend).
      void this.sendEmailVerification(user.id, user.email).catch((error) => {
        this.logger.error(
          `Verification email failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
      return toAuthUser(user);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw emailTaken();
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const user = await this.users.findByEmail(normalizeEmail(email));

    if (
      !user?.passwordHash ||
      user.status !== 'active' ||
      user.deletedAt !== null
    ) {
      await this.passwordHasher.verifyDummy(password);
      throw invalidCredentials();
    }

    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash,
      password,
    );

    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return toAuthUser(user);
  }

  /** Signs the user in: a fresh session id bound to the user. */
  async startSession(request: Request, userId: string): Promise<void> {
    await regenerateSession(request);
    request.session.userId = userId;
    request.session.signedInAtMs = this.clock.now().getTime();
    const userAgent = request.get('user-agent');
    if (userAgent) {
      request.session.userAgent = userAgent.slice(0, USER_AGENT_MAX_LENGTH);
    }
    await saveSession(request);
  }

  /**
   * The password was correct but the account has a second factor: the session
   * only remembers who is trying to sign in, for a few minutes.
   */
  async startMfaChallenge(request: Request, userId: string): Promise<void> {
    await regenerateSession(request);
    request.session.pendingMfa = {
      userId,
      expiresAtMs: this.clock.now().getTime() + MFA_CHALLENGE_TTL_MS,
    };
    await saveSession(request);
  }

  /** Returns the user waiting for a second factor, or throws if none/expired. */
  pendingMfaUserId(request: Request): string {
    const pending = request.session.pendingMfa;
    if (!pending || pending.expiresAtMs <= this.clock.now().getTime()) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'MFA_CHALLENGE_EXPIRED',
        message: 'Sign in again to continue',
      });
    }
    return pending.userId;
  }

  async findActiveUser(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active' || user.deletedAt !== null) {
      throw invalidCredentials();
    }
    return toAuthUser(user);
  }

  async sendEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const validHours = this.emailVerificationTtlHours();
    const expiresAt = new Date(
      this.clock.now().getTime() + validHours * 60 * 60 * 1000,
    );
    await this.users.createEmailVerificationToken(
      userId,
      hashToken(token),
      expiresAt,
    );
    await this.mailer.sendEmailVerification(email, token, validHours);
  }

  async resendEmailVerification(user: AuthUser): Promise<void> {
    if (user.emailVerified) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'Email is already verified',
      });
    }
    await this.sendEmailVerification(user.id, user.email);
  }

  /** Confirms an address: the current one, or a requested change. */
  async verifyEmail(token: string): Promise<void> {
    const outcome = await this.users.consumeEmailVerificationToken(
      hashToken(token),
      this.clock.now(),
    );
    if (outcome.status === 'invalid') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_VERIFICATION_TOKEN',
        message: 'Invalid or expired verification link',
      });
    }
    if (outcome.status === 'email_taken') {
      throw emailTaken();
    }
    if (outcome.status === 'email_changed') {
      // The old address learns about the change, in case it was not the owner.
      void this.mailer
        .sendEmailChangedNotice(outcome.previousEmail, outcome.newEmail)
        .catch((error) => {
          this.logger.error(
            `Email change notice failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
          );
        });
    }
  }

  private emailVerificationTtlHours(): number {
    return Number(
      this.configService.get<number>('EMAIL_VERIFICATION_TTL_HOURS') ?? 48,
    );
  }

  async logout(request: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(normalizeEmail(email));

    if (!user) {
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(this.clock.now().getTime() + RESET_TOKEN_TTL_MS);

    await this.users.createResetToken(user.id, tokenHash, expiresAt);

    try {
      await this.mailer.sendPasswordReset(user.email, token);
    } catch (error) {
      this.logger.error(
        `Password reset email failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const now = this.clock.now();
    const resetToken = await this.users.findValidResetToken(
      hashToken(token),
      now,
    );

    if (!resetToken) {
      throw invalidResetToken();
    }

    await this.breachChecker.assertNotBreached(password);
    const passwordHash = await this.passwordHasher.hash(password);

    try {
      await this.users.consumeResetToken(
        resetToken.id,
        resetToken.userId,
        passwordHash,
        now,
      );
    } catch (error) {
      if (error instanceof ResetTokenAlreadyUsedError) {
        throw invalidResetToken();
      }
      throw error;
    }
  }

  isSecureSessionCookie(): boolean {
    return this.configService.get<string>('SESSION_COOKIE_SECURE') !== 'false';
  }

  getSessionCookieName(): string {
    return resolveSessionCookieName(this.isSecureSessionCookie());
  }
}

function regenerateSession(request: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function emailTaken(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'EMAIL_TAKEN',
    message: 'Email is already registered',
  });
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  });
}

function invalidResetToken(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_RESET_TOKEN',
    message: 'Invalid or expired reset token',
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
