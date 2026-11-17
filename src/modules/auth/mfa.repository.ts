import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

export interface TotpState {
  secretCiphertext: string;
  confirmedAt: Date | null;
  lastUsedTimeStep: number | null;
}

@Injectable()
export class MfaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTotp(userId: string): Promise<TotpState | null> {
    const row = await this.prisma.userTotp.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      secretCiphertext: row.secretCiphertext,
      confirmedAt: row.confirmedAt,
      lastUsedTimeStep:
        row.lastUsedTimeStep === null ? null : Number(row.lastUsedTimeStep),
    };
  }

  /** Stores a new, unconfirmed secret (replacing an unconfirmed one). */
  async saveUnconfirmedTotp(
    userId: string,
    secretCiphertext: string,
  ): Promise<void> {
    await this.prisma.userTotp.upsert({
      where: { userId },
      create: { userId, secretCiphertext },
      update: { secretCiphertext, confirmedAt: null, lastUsedTimeStep: null },
    });
  }

  /**
   * Records an accepted code. The conditional update makes replays and
   * concurrent use of the same code fail: only one request can move the step.
   */
  async acceptTimeStep(userId: string, timeStep: number): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE "user_totp"
      SET "last_used_time_step" = ${BigInt(timeStep)}, "updated_at" = now()
      WHERE "user_id" = ${userId}::uuid
        AND ("last_used_time_step" IS NULL OR "last_used_time_step" < ${BigInt(timeStep)})`;
    return updated === 1;
  }

  /** Confirms the TOTP factor and replaces all recovery codes, atomically. */
  async enableTotp(
    userId: string,
    confirmedAt: Date,
    recoveryCodeHashes: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userTotp.update({
        where: { userId },
        data: { confirmedAt },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({ userId, codeHash })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'user.mfa_enabled',
          entityType: 'user',
          entityId: userId,
        },
      });
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userTotp.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'user.mfa_disabled',
          entityType: 'user',
          entityId: userId,
        },
      });
    });
  }

  async replaceRecoveryCodes(
    userId: string,
    recoveryCodeHashes: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  /** Marks a recovery code as used; false if unknown or already used. */
  async consumeRecoveryCode(
    userId: string,
    codeHash: string,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: now },
    });
    return updated.count === 1;
  }

  countUnusedRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  }
}
