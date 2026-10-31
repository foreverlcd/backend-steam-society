import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Booking } from '../domain/booking.js';
import type { BookingStatus } from '../domain/booking-status.js';
import {
  BookingStatusConflictError,
  MenteeOverlapError,
  SlotTakenError,
  type BookingRepositoryPort,
  type BookingScope,
  type BookingTransitionData,
  type CreateBookingData,
} from '../application/ports/booking.repository.js';

const bookingInclude = {
  session: {
    include: {
      offering: true,
      mentor: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              timezone: true,
            },
          },
        },
      },
    },
  },
  mentee: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          timezone: true,
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

@Injectable()
export class PrismaBookingRepository implements BookingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBookingData): Promise<Booking> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent requests for the same mentee and mentor. Locks
        // are always taken in this order to avoid deadlocks.
        // pg_advisory_xact_lock returns void, which the pg adapter cannot
        // deserialize. Casting to text keeps the lock and returns a row.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.menteeId}, 1))::text AS locked`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.mentorId}, 2))::text AS locked`;

        const menteeOverlap = await tx.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM booking b
            JOIN session s ON s.id = b.session_id
            WHERE b.mentee_id = ${data.menteeId}
              AND b.status IN ('requested', 'awaiting_payment', 'confirmed')
              AND s.starts_at < ${data.endsAt}
              AND s.ends_at > ${data.startsAt}
          ) AS "exists"
        `;

        if (menteeOverlap[0]?.exists) {
          throw new MenteeOverlapError();
        }

        const mentorOverlap = await tx.session.findFirst({
          where: {
            mentorId: data.mentorId,
            status: { not: 'cancelled' },
            startsAt: { lt: data.endsAt },
            endsAt: { gt: data.startsAt },
          },
          select: { id: true },
        });

        if (mentorOverlap) {
          throw new SlotTakenError();
        }

        const session = await tx.session.create({
          data: {
            offeringId: data.offeringId,
            mentorId: data.mentorId,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            capacity: 1,
            status: 'open',
          },
        });

        const booking = await tx.booking.create({
          data: {
            sessionId: session.id,
            menteeId: data.menteeId,
            status: 'requested',
            message: data.message,
            requestedAt: data.requestedAt,
            expiresAt: data.expiresAt,
            paymentRequired: data.paymentRequired,
            priceMinor: data.priceMinor,
            currency: data.currency,
          },
          include: bookingInclude,
        });

        return toBooking(booking);
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new SlotTakenError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Booking | null> {
    const record = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });

    return record ? toBooking(record) : null;
  }

  async list(scope: BookingScope): Promise<Booking[]> {
    const where: Prisma.BookingWhereInput = {
      ...(scope.menteeId ? { menteeId: scope.menteeId } : {}),
      ...(scope.mentorId ? { session: { mentorId: scope.mentorId } } : {}),
      ...(scope.status ? { status: scope.status } : {}),
      ...(scope.cursor ? { id: { lt: scope.cursor } } : {}),
    };

    const records = await this.prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { id: 'desc' },
      take: (scope.limit ?? 20) + 1,
    });

    return records.map(toBooking);
  }

  async applyTransition(
    id: string,
    from: BookingStatus,
    data: BookingTransitionData,
  ): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id },
        select: { sessionId: true },
      });

      if (!existing) {
        throw new BookingStatusConflictError();
      }

      const result = await tx.booking.updateMany({
        where: { id, status: from },
        data: toBookingUpdate(data),
      });

      if (result.count !== 1) {
        throw new BookingStatusConflictError();
      }

      if (data.sessionStatus !== undefined || data.meetingUrl !== undefined) {
        await tx.session.update({
          where: { id: existing.sessionId },
          data: {
            ...(data.sessionStatus !== undefined
              ? { status: data.sessionStatus }
              : {}),
            ...(data.meetingUrl !== undefined
              ? { meetingUrl: data.meetingUrl }
              : {}),
          },
        });
      }

      const record = await tx.booking.findUnique({
        where: { id },
        include: bookingInclude,
      });

      if (!record) {
        throw new BookingStatusConflictError();
      }

      return toBooking(record);
    });
  }

  async expireById(id: string, now: Date): Promise<Booking | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id },
        select: { status: true, sessionId: true, expiresAt: true },
      });

      if (
        !current ||
        (current.status !== 'requested' &&
          current.status !== 'awaiting_payment') ||
        current.expiresAt.getTime() > now.getTime()
      ) {
        return null;
      }

      const result = await tx.booking.updateMany({
        where: {
          id,
          status: { in: ['requested', 'awaiting_payment'] },
          expiresAt: { lte: now },
        },
        data: { status: 'expired' },
      });

      if (result.count !== 1) {
        return null;
      }

      await tx.session.updateMany({
        where: { id: current.sessionId, status: 'open' },
        data: { status: 'cancelled' },
      });

      const record = await tx.booking.findUnique({
        where: { id },
        include: bookingInclude,
      });

      return record ? toBooking(record) : null;
    });
  }

  async expireDue(now: Date, scope?: BookingScope): Promise<Booking[]> {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.booking.findMany({
        where: {
          status: { in: ['requested', 'awaiting_payment'] },
          expiresAt: { lte: now },
          ...(scope?.menteeId ? { menteeId: scope.menteeId } : {}),
          ...(scope?.mentorId
            ? { session: { mentorId: scope.mentorId } }
            : {}),
        },
        select: { id: true, sessionId: true },
        orderBy: { expiresAt: 'asc' },
        take: 100,
      });

      const expired: Booking[] = [];

      for (const item of due) {
        const result = await tx.booking.updateMany({
          where: {
            id: item.id,
            status: { in: ['requested', 'awaiting_payment'] },
            expiresAt: { lte: now },
          },
          data: { status: 'expired' },
        });

        if (result.count !== 1) {
          continue;
        }

        await tx.session.updateMany({
          where: { id: item.sessionId, status: 'open' },
          data: { status: 'cancelled' },
        });

        const record = await tx.booking.findUnique({
          where: { id: item.id },
          include: bookingInclude,
        });

        if (record) {
          expired.push(toBooking(record));
        }
      }

      return expired;
    });
  }
}

function toBookingUpdate(
  data: BookingTransitionData,
): Prisma.BookingUpdateManyMutationInput {
  return {
    status: data.status,
    ...(data.respondedAt !== undefined
      ? { respondedAt: data.respondedAt }
      : {}),
    ...(data.confirmedAt !== undefined
      ? { confirmedAt: data.confirmedAt }
      : {}),
    ...(data.cancelledAt !== undefined
      ? { cancelledAt: data.cancelledAt }
      : {}),
    ...(data.cancelledBy !== undefined
      ? { cancelledBy: data.cancelledBy }
      : {}),
    ...(data.cancelReason !== undefined
      ? { cancelReason: data.cancelReason }
      : {}),
    ...(data.completedAt !== undefined
      ? { completedAt: data.completedAt }
      : {}),
    ...(data.noShowParty !== undefined
      ? { noShowParty: data.noShowParty }
      : {}),
  };
}

function toBooking(record: BookingRecord): Booking {
  return {
    id: record.id,
    sessionId: record.sessionId,
    menteeId: record.menteeId,
    status: record.status,
    message: record.message,
    requestedAt: record.requestedAt,
    respondedAt: record.respondedAt,
    expiresAt: record.expiresAt,
    confirmedAt: record.confirmedAt,
    cancelledAt: record.cancelledAt,
    cancelledBy: record.cancelledBy,
    cancelReason: record.cancelReason,
    completedAt: record.completedAt,
    noShowParty: record.noShowParty,
    paymentRequired: record.paymentRequired,
    priceMinor: record.priceMinor,
    currency: record.currency,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    session: {
      id: record.session.id,
      offeringId: record.session.offeringId,
      mentorId: record.session.mentorId,
      startsAt: record.session.startsAt,
      endsAt: record.session.endsAt,
      capacity: record.session.capacity,
      status: record.session.status,
      meetingUrl: record.session.meetingUrl,
    },
    offering: {
      id: record.session.offering.id,
      title: record.session.offering.title,
      durationMinutes: record.session.offering.durationMinutes,
      isFree: record.session.offering.isFree,
      priceMinor: record.session.offering.priceMinor,
      currency: record.session.offering.currency,
    },
    mentor: {
      id: record.session.mentor.user.id,
      firstName: record.session.mentor.user.firstName,
      lastName: record.session.mentor.user.lastName,
      email: record.session.mentor.user.email,
      timezone: record.session.mentor.user.timezone,
    },
    mentee: {
      id: record.mentee.user.id,
      firstName: record.mentee.user.firstName,
      lastName: record.mentee.user.lastName,
      email: record.mentee.user.email,
      timezone: record.mentee.user.timezone,
    },
  };
}

function isExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const meta = error.meta as
    | { code?: string; message?: string }
    | undefined;

  return (
    meta?.code === '23P01' ||
    meta?.message?.includes('session_no_overlap') === true
  );
}
