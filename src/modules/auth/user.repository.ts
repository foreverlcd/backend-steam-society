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

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
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

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
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
