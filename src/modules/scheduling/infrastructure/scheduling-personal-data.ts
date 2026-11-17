import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';

/** Weekly availability and offerings of a mentor. */
@Injectable()
export class SchedulingPersonalData
  implements PersonalDataContributor, OnModuleInit
{
  readonly section = 'scheduling';
  readonly eraseOrder = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async exportFor(userId: string): Promise<unknown> {
    const [availability, offerings] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { userId },
        select: {
          weekday: true,
          startTime: true,
          endTime: true,
          timezone: true,
        },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.offering.findMany({
        where: { mentorId: userId },
        select: {
          title: true,
          description: true,
          durationMinutes: true,
          isFree: true,
          priceMinor: true,
          currency: true,
          active: true,
          archivedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      // TIME columns come back as 1970-01-01 dates: keep only HH:MM.
      availability: availability.map((rule) => ({
        ...rule,
        startTime: rule.startTime.toISOString().slice(11, 16),
        endTime: rule.endTime.toISOString().slice(11, 16),
      })),
      offerings,
    };
  }

  /** Availability goes away; offerings are archived (bookings reference them). */
  async erase(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.availabilityRule.deleteMany({ where: { userId } });
    await tx.offering.updateMany({
      where: { mentorId: userId },
      data: { active: false, archivedAt: now, description: null },
    });
  }
}
