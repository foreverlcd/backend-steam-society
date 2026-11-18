import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BookingsService } from '../bookings/application/bookings.service.js';
import type {
  ListAdminBookingsQuery,
  ListAdminUsersQuery,
} from './admin.schemas.js';

const DAY_MS = 86_400_000;

function name(user: { firstName: string | null; lastName: string | null }) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Sin nombre'
  );
}

/** Read models and actions the team needs to run the pilot (F4 subset). */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview() {
    const now = this.clock.now();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const next7 = new Date(now.getTime() + 7 * DAY_MS);

    const [
      usersByRole,
      newUsers30,
      mentorsPending,
      mentorsApproved,
      bookingsByStatus,
      upcomingConfirmed,
      openReports,
      emailFailed7,
      emailPending,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role', 'status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: since30 } },
      }),
      this.prisma.mentorProfile.count({ where: { status: 'pending_review' } }),
      this.prisma.mentorProfile.count({ where: { status: 'approved' } }),
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { requestedAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.booking.count({
        where: {
          status: 'confirmed',
          session: { startsAt: { gte: now, lt: next7 } },
        },
      }),
      this.prisma.report.count({ where: { status: 'open' } }),
      this.prisma.emailOutbox.count({
        where: { status: 'failed', createdAt: { gte: since7 } },
      }),
      this.prisma.emailOutbox.count({ where: { status: 'pending' } }),
    ]);

    const users: Record<string, Record<string, number>> = {};
    for (const row of usersByRole) {
      users[row.role] ??= {};
      users[row.role][row.status] = row._count._all;
    }
    const bookings30: Record<string, number> = {};
    for (const row of bookingsByStatus) {
      bookings30[row.status] = row._count._all;
    }

    return {
      generatedAt: now.toISOString(),
      users,
      newUsersLast30Days: newUsers30,
      mentors: { pendingReview: mentorsPending, approved: mentorsApproved },
      bookingsLast30Days: bookings30,
      upcomingConfirmedNext7Days: upcomingConfirmed,
      openReports,
      email: { failedLast7Days: emailFailed7, pending: emailPending },
    };
  }

  async listUsers(query: ListAdminUsersQuery) {
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        mentorProfile: { select: { status: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        email: row.email,
        name: name(row),
        role: row.role,
        status: row.status,
        emailVerified: row.emailVerifiedAt !== null,
        mentorStatus: row.mentorProfile?.status ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        timezone: true,
        emailVerifiedAt: true,
        createdAt: true,
        deletedAt: true,
        mentorProfile: { select: { status: true } },
        totp: { select: { confirmedAt: true } },
      },
    });
    if (!user || user.deletedAt) throw userNotFound();

    const [asMentee, asMentor, reportsAgainst, reportsFiled, blockedBy, audit] =
      await Promise.all([
        this.prisma.booking.groupBy({
          by: ['status'],
          where: { menteeId: id },
          _count: { _all: true },
        }),
        this.prisma.booking.groupBy({
          by: ['status'],
          where: { session: { mentorId: id } },
          _count: { _all: true },
        }),
        this.prisma.report.groupBy({
          by: ['status'],
          where: { reportedUserId: id },
          _count: { _all: true },
        }),
        this.prisma.report.count({ where: { reporterId: id } }),
        this.prisma.userBlock.count({ where: { blockedId: id } }),
        this.prisma.auditLog.findMany({
          where: { entityId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            action: true,
            createdAt: true,
            metadata: true,
            actor: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);
    const counts = (
      rows: Array<{ status: string; _count: { _all: number } }>,
    ) => Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

    return {
      id: user.id,
      email: user.email,
      name: name(user),
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.totp?.confirmedAt != null,
      mentorStatus: user.mentorProfile?.status ?? null,
      createdAt: user.createdAt.toISOString(),
      bookingsAsMentee: counts(asMentee),
      bookingsAsMentor: counts(asMentor),
      reportsAgainst: counts(reportsAgainst),
      reportsFiled,
      blockedByCount: blockedBy,
      history: audit.map((entry) => ({
        action: entry.action,
        at: entry.createdAt.toISOString(),
        actorName: entry.actor ? name(entry.actor) : null,
        metadata: entry.metadata,
      })),
    };
  }

  async listBookings(query: ListAdminBookingsQuery) {
    const rows = await this.prisma.booking.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId
          ? {
              OR: [
                { menteeId: query.userId },
                { session: { mentorId: query.userId } },
              ],
            }
          : {}),
        ...(query.from || query.to
          ? {
              session: {
                startsAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lt: new Date(query.to) } : {}),
                },
              },
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        status: true,
        requestedAt: true,
        cancelledBy: true,
        cancelReason: true,
        mentee: {
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        session: {
          select: {
            startsAt: true,
            endsAt: true,
            offering: { select: { title: true } },
            mentor: {
              select: {
                user: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        status: row.status,
        requestedAt: row.requestedAt.toISOString(),
        startsAt: row.session.startsAt.toISOString(),
        endsAt: row.session.endsAt.toISOString(),
        offeringTitle: row.session.offering.title,
        mentee: { id: row.mentee.user.id, name: name(row.mentee.user) },
        mentor: {
          id: row.session.mentor.user.id,
          name: name(row.session.mentor.user),
        },
        cancelledBy: row.cancelledBy,
        cancelReason: row.cancelReason,
      })),
      nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
    };
  }

  async cancelBooking(admin: AuthUser, bookingId: string, reason: string) {
    const booking = await this.bookings.cancelAsAdmin(bookingId, reason);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: 'booking.cancelled_by_admin',
        entityType: 'booking',
        entityId: bookingId,
        metadata: { reason },
      },
    });
    return { id: booking.id, status: booking.status };
  }
}

function userNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
  });
}
