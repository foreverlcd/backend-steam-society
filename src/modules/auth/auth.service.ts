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
import { PasswordHasher } from './password-hasher.service.js';
import {
  ResetTokenAlreadyUsedError,
  UserRepository,
  toAuthUser,
} from './user.repository.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly mailer: MailerService,
    private readonly configService: ConfigService,
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

    const valid = await this.passwordHasher.verify(user.passwordHash, password);

    if (!valid) {
      throw invalidCredentials();
    }

    return toAuthUser(user);
  }

  async startSession(request: Request, userId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    request.session.userId = userId;

    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
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

function normalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function emailTaken(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'EMAIL_TAKEN',
    message: 'Email is already registered',
  });
}

function invalidCredentials(): UnauthorizedException {
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
