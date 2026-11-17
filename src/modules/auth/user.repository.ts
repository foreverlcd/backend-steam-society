import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type { UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AuthUser } from './auth.types.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  birthDate: Date;
  firstName?: string;
  lastName?: string;
}

/** A user row plus the one-to-one TOTP state, enough to build an AuthUser. */
export type UserWithMfa = User & { totp: { confirmedAt: Date | null } | null };

const WITH_MFA = { totp: { select: { confirmedAt: true } } } as const;

export function toAuthUser(user: UserWithMfa): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
    emailVerified: user.emailVerifiedAt !== null,
    mfaEnabled: user.totp?.confirmedAt != null,
  };
}

export type EmailTokenOutcome =
  | { status: 'invalid' }
  | { status: 'email_taken' }
  | { status: 'verified'; userId: string }
  | {
      status: 'email_changed';
      userId: string;
      previousEmail: string;
      newEmail: string;
    };

export class ResetTokenAlreadyUsedError extends Error {
  constructor() {
    super('Reset token already used');
    this.name = 'ResetTokenAlreadyUsedError';
  }
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithMfa | null> {
    return this.prisma.user.findUnique({ where: { email }, include: WITH_MFA });
  }

  findById(id: string): Promise<UserWithMfa | null> {
    return this.prisma.user.findUnique({ where: { id }, include: WITH_MFA });
  }

  create(input: CreateUserInput): Promise<UserWithMfa> {
    return this.prisma.user.create({
      include: WITH_MFA,
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        birthDate: input.birthDate,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
  }

  /**
   * Replaces the user's unused tokens of the same kind with a new one. Kinds:
   * verifying the current address (newEmail null) or confirming a change.
   */
  createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    newEmail: string | null = null,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the user row so concurrent resends run one after the other and
      // only the newest link stays valid.
      await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      await tx.emailVerificationToken.deleteMany({
        where: {
          userId,
          usedAt: null,
          newEmail: newEmail === null ? null : { not: null },
        },
      });
      await tx.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt, newEmail },
      });
    });
  }

  /**
   * Atomically consumes a valid token. A plain token marks the address as
   * verified; an email-change token moves the account to the new address
   * (already proven, so it is verified too) and audits the change.
   */
  consumeEmailVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<EmailTokenOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        select: { id: true, userId: true, newEmail: true },
      });
      if (!token) return { status: 'invalid' };

      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return { status: 'invalid' };

      if (token.newEmail === null) {
        await tx.user.updateMany({
          where: { id: token.userId, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
        await tx.emailVerificationToken.deleteMany({
          where: { userId: token.userId, usedAt: null, newEmail: null },
        });
        return { status: 'verified', userId: token.userId };
      }

      const taken = await tx.user.findUnique({
        where: { email: token.newEmail },
        select: { id: true },
      });
      if (taken) return { status: 'email_taken' };

      const previous = await tx.user.findUniqueOrThrow({
        where: { id: token.userId },
        select: { email: true },
      });
      await tx.user.update({
        where: { id: token.userId },
        data: { email: token.newEmail, emailVerifiedAt: now },
      });
      // Older links (of either kind) point to stale addresses.
      await tx.emailVerificationToken.deleteMany({
        where: { userId: token.userId, usedAt: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: token.userId,
          action: 'user.email_changed',
          entityType: 'user',
          entityId: token.userId,
        },
      });
      return {
        status: 'email_changed',
        userId: token.userId,
        previousEmail: previous.email,
        newEmail: token.newEmail,
      };
    });
  }

  /** Sets a new password hash and audits it (sessions are handled by the caller). */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'user.password_changed',
          entityType: 'user',
          entityId: userId,
        },
      }),
    ]);
  }

  createResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId, usedAt: null },
      });
      await tx.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt },
      });
    });
  }

  findValidResetToken(
    tokenHash: string,
    now: Date,
  ): Promise<{ id: string; userId: string } | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
  }

  async consumeResetToken(
    tokenId: string,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        throw new ResetTokenAlreadyUsedError();
      }

      await tx.passwordResetToken.deleteMany({
        where: { userId, usedAt: null },
      });
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await revokeSessions(tx, userId);
    });
  }
}

async function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`DELETE FROM auth_session WHERE sess->>'userId' = ${userId}`;
}
