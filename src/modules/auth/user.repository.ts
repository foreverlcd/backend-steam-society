import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type { UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AuthUser } from './auth.types.js';
import { GUARDIAN_CONSENT_MIN_AGE, ageInYears } from './legal-terms.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  birthDate: Date;
  firstName?: string;
  lastName?: string;
  termsAcceptedAt: Date;
  termsVersion: string;
  guardianEmail: string | null;
}

/** A user row plus the one-to-one TOTP state, enough to build an AuthUser. */
export type UserWithMfa = User & { totp: { confirmedAt: Date | null } | null };

const WITH_MFA = { totp: { select: { confirmedAt: true } } } as const;

export function toAuthUser(user: UserWithMfa, now: Date): AuthUser {
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
    guardianConsentPending: isGuardianConsentPending(user, now),
  };
}

/** Under 14 today, with a guardian address on file and no confirmation yet. */
export function isGuardianConsentPending(
  user: Pick<User, 'birthDate' | 'guardianEmail' | 'guardianConsentAt'>,
  now: Date,
): boolean {
  return (
    user.guardianEmail !== null &&
    user.guardianConsentAt === null &&
    user.birthDate !== null &&
    ageInYears(user.birthDate, now) < GUARDIAN_CONSENT_MIN_AGE
  );
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

class GuardianConsentNotApplied extends Error {
  constructor() {
    super('Guardian consent not applied');
    this.name = 'GuardianConsentNotApplied';
  }
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
        termsAcceptedAt: input.termsAcceptedAt,
        termsVersion: input.termsVersion,
        guardianEmail: input.guardianEmail,
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
  async consumeEmailVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<EmailTokenOutcome> {
    try {
      return await this.consumeEmailVerificationTokenOnce(tokenHash, now);
    } catch (error) {
      // Someone registered the new address between our check and the update:
      // the transaction rolled back, so the link stays usable.
      if (isUniqueViolation(error)) return { status: 'email_taken' };
      throw error;
    }
  }

  private consumeEmailVerificationTokenOnce(
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

  /**
   * Replaces the user's unused consent links with a new one, optionally
   * correcting the guardian address in the same transaction. Returns false
   * (and changes nothing) when, under the row lock, the account is gone or
   * no longer waiting for consent.
   */
  createGuardianConsentToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    guardianEmail?: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ pending: boolean }>>`
        SELECT ("guardian_consent_at" IS NULL AND "deleted_at" IS NULL
                AND "guardian_email" IS NOT NULL) AS pending
        FROM "user" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (!row?.pending) return false;
      if (guardianEmail !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { guardianEmail },
        });
      }
      await tx.guardianConsentToken.deleteMany({
        where: { userId, usedAt: null },
      });
      await tx.guardianConsentToken.create({
        data: { userId, tokenHash, expiresAt },
      });
      return true;
    });
  }

  /**
   * Atomically consumes a valid consent link and records the consent. Returns
   * false, leaving the link unused, when the link is unknown, expired or used,
   * or the account no longer waits for consent (deleted, already given).
   */
  async consumeGuardianConsentToken(
    tokenHash: string,
    now: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const token = await tx.guardianConsentToken.findFirst({
          where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
          select: { id: true, userId: true },
        });
        if (!token) throw new GuardianConsentNotApplied();

        const claimed = await tx.guardianConsentToken.updateMany({
          where: { id: token.id, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new GuardianConsentNotApplied();

        const updated = await tx.user.updateMany({
          where: {
            id: token.userId,
            guardianConsentAt: null,
            deletedAt: null,
            guardianEmail: { not: null },
          },
          data: { guardianConsentAt: now },
        });
        // Rolls back the claim too: nothing was authorised.
        if (updated.count !== 1) throw new GuardianConsentNotApplied();

        await tx.guardianConsentToken.deleteMany({
          where: { userId: token.userId, usedAt: null },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: null,
            action: 'user.guardian_consent_given',
            entityType: 'user',
            entityId: token.userId,
          },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof GuardianConsentNotApplied) return false;
      throw error;
    }
  }

  /**
   * Sets a new password hash, audits it and signs out every other session, all
   * in one transaction: an old session never survives with the new password.
   */
  async updatePassword(
    userId: string,
    passwordHash: string,
    keepSessionId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.$executeRaw`
        DELETE FROM auth_session WHERE sess->>'userId' = ${userId} AND sid <> ${keepSessionId}`,
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
