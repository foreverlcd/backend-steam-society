import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

/**
 * Blocks and the reports the user FILED. Reports about the user are a
 * moderation record and are not exported: that would expose the reporter.
 */
@Injectable()
export class SafetyPersonalData
  implements PersonalDataContributor, OnModuleInit
{
  readonly section = 'safety';
  readonly eraseOrder = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async exportFor(userId: string): Promise<unknown> {
    const [blocks, reports] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        select: { blockedId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.report.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          reportedUserId: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { blocks, reportsFiled: reports };
  }

  async erase(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.userBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    // The report stays for the moderation history; the free text goes.
    await tx.report.updateMany({
      where: { reporterId: userId },
      data: { details: null },
    });
  }
}
