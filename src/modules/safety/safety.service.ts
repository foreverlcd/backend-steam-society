import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { EmailOutbox } from '../../shared/mail/email-outbox.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { BookingsService } from '../bookings/application/bookings.service.js';
import {
  cannotTargetAdmin,
  cannotTargetSelf,
  reportBookingMismatch,
  userNotFound,
} from './safety.errors.js';
import type { CreateReportBody } from './safety.schemas.js';

export interface BlockedUser {
  userId: string;
  name: string;
  role: 'mentee' | 'mentor';
  blockedAt: string;
}

/**
 * What members can do to protect themselves (ADR-029): block someone, which
 * cancels their open bookings together and stops new ones, and report
 * someone to the moderation queue.
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly outbox: EmailOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<string>('APP_URL').replace(/\/+$/, '');
  }

  async block(
    user: AuthUser,
    targetId: string,
  ): Promise<{ blockedUserId: string; cancelledBookings: number }> {
    await this.assertTarget(user, targetId);
    await this.prisma.userBlock.createMany({
      data: { blockerId: user.id, blockedId: targetId },
      skipDuplicates: true,
    });
    const cancelledBookings = await this.bookings.withdrawOpenBookings({
      userId: user.id,
      counterpartId: targetId,
      cancelledBy: user.role === 'mentor' ? 'mentor' : 'mentee',
      // The blocked person only sees a cancellation, never the block.
      reason: null,
    });
    return { blockedUserId: targetId, cancelledBookings };
  }

  async unblock(user: AuthUser, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: user.id, blockedId: targetId },
    });
  }

  async listBlocks(user: AuthUser): Promise<BlockedUser[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
    return rows.map((row) => ({
      userId: row.blocked.id,
      name: fullName(row.blocked),
      role: row.blocked.role === 'mentor' ? 'mentor' : 'mentee',
      blockedAt: row.createdAt.toISOString(),
    }));
  }

  async report(
    user: AuthUser,
    input: CreateReportBody,
  ): Promise<{ id: string; status: 'open' }> {
    await this.assertTarget(user, input.reportedUserId);

    if (input.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: input.bookingId },
        select: { menteeId: true, session: { select: { mentorId: true } } },
      });
      const pair = booking ? [booking.menteeId, booking.session.mentorId] : [];
      if (!pair.includes(user.id) || !pair.includes(input.reportedUserId)) {
        throw reportBookingMismatch();
      }
    }

    // One open report per reporter, person and booking is enough: repeats
    // return the same report and do not alert the team again.
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: user.id,
        reportedUserId: input.reportedUserId,
        bookingId: input.bookingId ?? null,
        status: 'open',
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, status: 'open' };

    const report = await this.prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId: input.reportedUserId,
        bookingId: input.bookingId ?? null,
        reason: input.reason,
        details: input.details ?? null,
        createdAt: this.clock.now(),
      },
      select: { id: true },
    });

    await this.alertModerators(input.reason);
    return { id: report.id, status: 'open' };
  }

  /** Neither the reporter's identity nor the details leave the platform. */
  private async alertModerators(reason: string): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'admin', status: 'active', deletedAt: null },
        select: { email: true },
      });
      for (const admin of admins) {
        await this.outbox.enqueue({
          kind: 'safety.report_received',
          to: admin.email,
          subject: 'Nuevo reporte en Steam Society',
          text: [
            `Llegó un reporte nuevo (motivo: ${reason}).`,
            `Revísalo en la cola de moderación: ${this.appUrl}/admin/reports`,
          ].join('\n\n'),
        });
      }
    } catch (error) {
      // The report is saved; the queue shows it even without the e-mail.
      this.logger.error(
        `Moderator alert failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }

  private async assertTarget(user: AuthUser, targetId: string): Promise<void> {
    if (targetId === user.id) throw cannotTargetSelf();
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw userNotFound();
    if (target.role === 'admin') throw cannotTargetAdmin();
  }
}

export function fullName(user: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Sin nombre'
  );
}
