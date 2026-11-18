import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { EmailOutbox } from '../../shared/mail/email-outbox.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SessionRepository } from '../auth/session.repository.js';
import { BookingsService } from '../bookings/application/bookings.service.js';
import {
  cannotTargetAdmin,
  reportAlreadyClosed,
  reportNotFound,
  userNotActive,
  userNotFound,
  userNotSuspended,
} from './safety.errors.js';
import type { ListReportsQuery, ResolveReportBody } from './safety.schemas.js';
import { fullName } from './safety.service.js';

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
} as const;

type Person = Prisma.UserGetPayload<{ select: typeof personSelect }>;

const SUSPENSION_BOOKING_REASON = 'Cancelada por el equipo de Steam Society.';

/** The moderation queue and account suspension (ADR-029), admins only. */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly sessions: SessionRepository,
    private readonly outbox: EmailOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listReports(query: ListReportsQuery) {
    // The open queue goes oldest first; closed reports, newest first.
    const ascending = query.status === 'open';
    const rows = await this.prisma.report.findMany({
      where: {
        status: query.status,
        ...(query.cursor
          ? { id: ascending ? { gt: query.cursor } : { lt: query.cursor } }
          : {}),
      },
      orderBy: { id: ascending ? 'asc' : 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        bookingId: true,
        reporter: { select: personSelect },
        reportedUser: { select: personSelect },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        reason: row.reason,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        bookingId: row.bookingId,
        reporter: toPerson(row.reporter),
        reportedUser: toPerson(row.reportedUser),
      })),
      nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
    };
  }

  async getReport(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: personSelect },
        reportedUser: { select: personSelect },
        resolvedBy: { select: personSelect },
        booking: {
          select: {
            id: true,
            status: true,
            session: {
              select: {
                startsAt: true,
                offering: { select: { title: true } },
              },
            },
          },
        },
      },
    });
    if (!report) throw reportNotFound();

    const [againstTotal, againstOpen] = await Promise.all([
      this.prisma.report.count({
        where: { reportedUserId: report.reportedUserId },
      }),
      this.prisma.report.count({
        where: { reportedUserId: report.reportedUserId, status: 'open' },
      }),
    ]);

    return {
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      action: report.action,
      resolutionNote: report.resolutionNote,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      resolvedBy: report.resolvedBy ? toPerson(report.resolvedBy) : null,
      reporter: toPerson(report.reporter),
      reportedUser: {
        ...toPerson(report.reportedUser),
        reportsTotal: againstTotal,
        reportsOpen: againstOpen,
      },
      booking: report.booking
        ? {
            id: report.booking.id,
            status: report.booking.status,
            offeringTitle: report.booking.session.offering.title,
            startsAt: report.booking.session.startsAt.toISOString(),
          }
        : null,
    };
  }

  async resolveReport(admin: AuthUser, id: string, input: ResolveReportBody) {
    const now = this.clock.now();
    const status = input.action === 'dismiss' ? 'dismissed' : 'resolved';
    const action =
      input.action === 'dismiss'
        ? 'none'
        : input.action === 'warn'
          ? 'warned'
          : 'suspended';

    const report = await this.prisma.$transaction(async (tx) => {
      const found = await tx.report.findUnique({
        where: { id },
        select: {
          reportedUserId: true,
          reportedUser: { select: { status: true, deletedAt: true } },
        },
      });
      if (!found) throw reportNotFound();
      // Only record a suspension that is real: the account must be active
      // (it gets suspended below) or already suspended.
      if (
        input.action === 'suspend' &&
        (found.reportedUser.deletedAt ||
          !['active', 'suspended'].includes(found.reportedUser.status))
      ) {
        throw userNotActive();
      }
      // Two moderators acting at once: only the first one wins.
      const { count } = await tx.report.updateMany({
        where: { id, status: 'open' },
        data: {
          status,
          action,
          resolutionNote: input.note,
          resolvedById: admin.id,
          resolvedAt: now,
        },
      });
      if (count === 0) throw reportAlreadyClosed();
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: 'report.resolved',
          entityType: 'report',
          entityId: id,
          metadata: { action },
        },
      });
      return found;
    });

    if (input.action === 'warn') {
      await this.sendWarning(report.reportedUserId);
    } else if (input.action === 'suspend') {
      const target = await this.prisma.user.findUnique({
        where: { id: report.reportedUserId },
        select: { status: true },
      });
      if (target?.status === 'active') {
        await this.suspendUser(admin, report.reportedUserId, input.note);
      }
    }

    return this.getReport(id);
  }

  /**
   * Blocks the account at once: sign-in and every open session stop working,
   * and its open bookings are cancelled (the other people are told).
   */
  async suspendUser(admin: AuthUser, userId: string, reason: string) {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, deletedAt: true },
      });
      if (!user || user.deletedAt) throw userNotFound();
      if (user.role === 'admin') throw cannotTargetAdmin();
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'active' },
        data: { status: 'suspended', updatedAt: now },
      });
      if (count === 0) throw userNotActive();
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: 'user.suspended',
          entityType: 'user',
          entityId: userId,
          metadata: { reason },
        },
      });
    });

    await this.sessions.revokeAll(userId);
    const cancelledBookings = await this.bookings.withdrawOpenBookings({
      userId,
      counterpartId: null,
      cancelledBy: 'admin',
      reason: SUSPENSION_BOOKING_REASON,
    });
    return { userId, status: 'suspended' as const, cancelledBookings };
  }

  async reactivateUser(admin: AuthUser, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { deletedAt: true },
      });
      if (!user || user.deletedAt) throw userNotFound();
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'suspended' },
        data: { status: 'active', updatedAt: this.clock.now() },
      });
      if (count === 0) throw userNotSuspended();
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: 'user.reactivated',
          entityType: 'user',
          entityId: userId,
          metadata: {},
        },
      });
    });
    return { userId, status: 'active' as const };
  }

  /** Generic on purpose: it never says who reported or what they wrote. */
  private async sendWarning(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return;
      await this.outbox.enqueue({
        kind: 'safety.warning',
        to: user.email,
        subject: 'Aviso sobre tu conducta en Steam Society',
        text: [
          `Hola ${user.firstName ?? ''}:`.replace(' :', ':'),
          'Recibimos un reporte sobre una interacción tuya en Steam Society y lo revisamos.',
          'Te pedimos tratar a todas las personas con respeto. Si vuelve a ocurrir, podemos suspender tu cuenta.',
          'Si crees que se trata de un error, responde a este correo.',
        ].join('\n\n'),
      });
    } catch (error) {
      this.logger.error(
        `Warning e-mail failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}

function toPerson(person: Person) {
  return {
    id: person.id,
    name: fullName(person),
    role: person.role,
    status: person.status,
  };
}
