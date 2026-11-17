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

  /** Replaces any unused verification token of the user with a new one. */
  createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the user row so concurrent resends run one after the other and
      // only the newest link stays valid.
      await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      await tx.emailVerificationToken.deleteMany({
        where: { userId, usedAt: null },
      });
      await tx.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt },
      });
    });
  }

  /**
   * Atomically consumes a valid token and marks the e-mail as verified.
   * Returns false when the token is unknown, expired or already used.
   */
  consumeEmailVerificationToken(tokenHash: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        select: { id: true, userId: true },
      });
      if (!token) return false;

      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;

      await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: token.userId, usedAt: null },
      });
      return true;
    });
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
