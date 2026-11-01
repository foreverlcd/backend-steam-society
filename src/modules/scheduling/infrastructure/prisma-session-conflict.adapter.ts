import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  MentorBusyInterval,
  SessionConflictPort,
} from '../application/ports/session-conflict.port.js';
import type { BusyInterval } from '../domain/slot.js';

@Injectable()
export class PrismaSessionConflictAdapter implements SessionConflictPort {
  constructor(private readonly prisma: PrismaService) {}

  async findBusyIntervals(
    mentorId: string,
    from: Date,
    to: Date,
  ): Promise<BusyInterval[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        mentorId,
        status: { not: 'cancelled' },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });

    return sessions;
  }

  async findBusyIntervalsForMentors(
    mentorIds: string[],
    from: Date,
    to: Date,
  ): Promise<MentorBusyInterval[]> {
    if (mentorIds.length === 0) {
      return [];
    }

    return this.prisma.session.findMany({
      where: {
        mentorId: { in: mentorIds },
        status: { not: 'cancelled' },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { mentorId: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
    });
  }
}
