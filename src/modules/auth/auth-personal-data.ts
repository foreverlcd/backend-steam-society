import {
  ForbiddenException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

/** The account row itself: exported, then anonymised (never hard-deleted). */
@Injectable()
export class AuthPersonalData implements PersonalDataContributor, OnModuleInit {
  readonly section = 'account';
  // Last: other modules may still read the user while erasing their part.
  readonly eraseOrder = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async exportFor(userId: string): Promise<unknown> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        timezone: true,
        locale: true,
        emailVerifiedAt: true,
        createdAt: true,
        termsAcceptedAt: true,
        termsVersion: true,
        guardianConsentAt: true,
        totp: { select: { confirmedAt: true } },
      },
    });
    const { totp, ...account } = user;
    return { ...account, twoFactorEnabledAt: totp?.confirmedAt ?? null };
  }

  async assertErasable(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true },
    });
    if (user.role === 'admin') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ADMIN_SELF_DELETE_FORBIDDEN',
        message:
          'Admin accounts are removed by another admin, not by themselves',
      });
    }
  }

  async erase(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthDate: true, email: true },
    });
    // Queued or recently sent e-mail to this person (including a pending
    // new address) holds their address and maybe a link: remove it too.
    const pendingAddresses = await tx.emailVerificationToken.findMany({
      where: { userId, newEmail: { not: null } },
      select: { newEmail: true },
    });
    await tx.emailOutbox.deleteMany({
      where: {
        toAddress: {
          in: [user.email, ...pendingAddresses.map((t) => t.newEmail!)],
        },
      },
    });
    await tx.userTotp.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        // Unique, lowercase and undeliverable (.invalid is reserved, RFC 2606).
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: null,
        firstName: null,
        lastName: null,
        // Non-admin rows require a birth date: keep only the year.
        birthDate: user.birthDate
          ? new Date(Date.UTC(user.birthDate.getUTCFullYear(), 0, 1))
          : null,
        emailVerifiedAt: null,
        status: 'deleted',
        deletedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'user.deleted',
        entityType: 'user',
        entityId: userId,
      },
    });
    await tx.$executeRaw`DELETE FROM auth_session WHERE sess->>'userId' = ${userId}`;
  }
}
