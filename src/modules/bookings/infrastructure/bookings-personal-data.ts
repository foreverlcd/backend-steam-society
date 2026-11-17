import {
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { lockAsMentee, lockAsMentor } from './prisma-booking.repository.js';

const OPEN_STATUSES = ['requested', 'awaiting_payment', 'confirmed'] as const;

/**
 * Bookings as mentee and as mentor. The rows stay after deletion: the other
 * person keeps their history. Free text written by the user is cleared.
 */
@Injectable()
export class BookingsPersonalData
  implements PersonalDataContributor, OnModuleInit
{
  readonly section = 'bookings';
  readonly eraseOrder = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async exportFor(userId: string): Promise<unknown> {
    const select = {
      id: true,
      status: true,
      message: true,
      requestedAt: true,
      confirmedAt: true,
      cancelledAt: true,
      cancelledBy: true,
      cancelReason: true,
      completedAt: true,
      noShowParty: true,
      priceMinor: true,
      currency: true,
      session: {
        select: {
          startsAt: true,
          endsAt: true,
          offering: { select: { title: true } },
        },
      },
    } as const;
    const [asMentee, asMentor] = await Promise.all([
      this.prisma.booking.findMany({
        where: { menteeId: userId },
        select: select,
        orderBy: { requestedAt: 'asc' },
      }),
      this.prisma.booking.findMany({
        where: { session: { mentorId: userId } },
        // The mentee's message is their data, not the mentor's: left out.
        select: { ...select, message: false },
        orderBy: { requestedAt: 'asc' },
      }),
    ]);
    return { asMentee, asMentor };
  }

  /** Open bookings have another person waiting: they must be closed first. */
  async assertErasable(userId: string, now: Date): Promise<void> {
    assertNoOpenBookings(await countOpenBookings(this.prisma, userId, now));
  }

  async erase(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    // Same locks as booking creation: a booking requested meanwhile either
    // commits first (and is counted here) or waits and then sees the deletion.
    await lockAsMentee(tx, userId);
    await lockAsMentor(tx, userId);
    assertNoOpenBookings(await countOpenBookings(tx, userId, now));

    await tx.booking.updateMany({
      where: { menteeId: userId },
      data: { message: null },
    });
    await tx.session.updateMany({
      where: { mentorId: userId },
      data: { meetingUrl: null },
    });
  }
}

function countOpenBookings(
  client: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<number> {
  return client.booking.count({
    where: {
      status: { in: [...OPEN_STATUSES] },
      session: { endsAt: { gt: now } },
      OR: [{ menteeId: userId }, { session: { mentorId: userId } }],
    },
  });
}

function assertNoOpenBookings(open: number): void {
  if (open > 0) {
    throw new ConflictException({
      statusCode: 409,
      code: 'ACCOUNT_HAS_OPEN_BOOKINGS',
      message:
        'Cancel or finish your open bookings before deleting the account',
      details: { openBookings: open },
    });
  }
}
