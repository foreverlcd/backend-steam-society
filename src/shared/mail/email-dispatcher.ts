import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport.js';

/** Wait before retry N (1-based). After the last one the e-mail fails. */
export const RETRY_DELAYS_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 3_600_000, // 2 h
  6 * 3_600_000, // 6 h
] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const BATCH_SIZE = 10;
/** Long enough for a whole batch even with slow SMTP timeouts. */
const LOCK_MS = 10 * 60_000;
const DEFAULT_INTERVAL_MS = 10_000;
/** Finished rows (sent, failed, expired) are kept this long, then deleted. */
const RETENTION_MS = 30 * 24 * 3_600_000;
const CLEANUP_EVERY_MS = 3_600_000;

interface ClaimedRow {
  id: string;
  to_address: string;
  subject: string;
  body: string;
  attempts: number;
  expires_at: Date | null;
}

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
  expired: number;
}

@Injectable()
export class EmailDispatcher {
  private readonly logger = new Logger(EmailDispatcher.name);
  private readonly enabled: boolean;
  private running = false;
  private warnedNotConfigured = false;
  private lastCleanupAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    @Inject(CLOCK) private readonly clock: Clock,
    configService: ConfigService,
  ) {
    this.enabled =
      Number(configService.get('EMAIL_DISPATCH_INTERVAL_MS') ?? 1) !== 0;
  }

  @Interval(DEFAULT_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const result = await this.dispatchDue();
      if (result.failed > 0) {
        this.logger.error(`E-mail delivery failed for good: ${result.failed}`);
      }
      await this.cleanupIfDue();
    } catch (error) {
      this.logger.error(
        `E-mail dispatch failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Sends what is due now. Safe to run from several processes at once. */
  async dispatchDue(): Promise<DispatchResult> {
    const result: DispatchResult = {
      sent: 0,
      retried: 0,
      failed: 0,
      expired: 0,
    };
    const now = this.clock.now();

    result.expired = await this.prisma.$executeRaw`
      UPDATE email_outbox
      SET status = 'expired', body = NULL, locked_until = NULL
      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ${now}`;

    if (!this.transport.configured) {
      if (!this.warnedNotConfigured) {
        this.logger.warn('SMTP_URL is not set: e-mail stays queued');
        this.warnedNotConfigured = true;
      }
      return result;
    }

    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE email_outbox
      SET locked_until = ${new Date(now.getTime() + LOCK_MS)},
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE status = 'pending'
          AND next_attempt_at <= ${now}
          AND (locked_until IS NULL OR locked_until <= ${now})
        ORDER BY next_attempt_at, id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_address, subject, body, attempts, expires_at`;

    for (const row of claimed) {
      const outcome = await this.deliver(row);
      result[outcome] += 1;
    }
    return result;
  }

  private async deliver(row: ClaimedRow): Promise<keyof DispatchResult> {
    // The batch may take a while: a link must not leave once it expired.
    if (row.expires_at !== null && row.expires_at <= this.clock.now()) {
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'expired', body: null, lockedUntil: null },
      });
      return 'expired';
    }
    try {
      // Delivery is at-least-once: if we crash after the SMTP server
      // accepted it, the row is sent again after the lock expires. The
      // stable Message-ID lets mail clients recognise the duplicate.
      await this.transport.deliver({
        to: row.to_address,
        subject: row.subject,
        text: row.body,
        messageId: `<${row.id}@outbox.steam-society>`,
      });
      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: 'sent',
          sentAt: this.clock.now(),
          body: null,
          lockedUntil: null,
          lastError: null,
        },
      });
      return 'sent';
    } catch (error) {
      const now = this.clock.now();
      const delay = RETRY_DELAYS_MS[row.attempts - 1];
      const nextAttemptAt =
        delay === undefined ? null : new Date(now.getTime() + delay);
      const giveUp =
        isPermanentFailure(error) ||
        nextAttemptAt === null ||
        (row.expires_at !== null && nextAttemptAt >= row.expires_at);

      await this.prisma.emailOutbox.update({
        where: { id: row.id },
        data: giveUp
          ? {
              status: 'failed',
              body: null,
              lockedUntil: null,
              lastError: errorCode(error),
            }
          : {
              nextAttemptAt: nextAttemptAt!,
              lockedUntil: null,
              lastError: errorCode(error),
            },
      });
      return giveUp ? 'failed' : 'retried';
    }
  }

  private async cleanupIfDue(): Promise<void> {
    const now = this.clock.now().getTime();
    if (now - this.lastCleanupAt < CLEANUP_EVERY_MS) return;
    this.lastCleanupAt = now;
    await this.prisma.emailOutbox.deleteMany({
      where: {
        status: { not: 'pending' },
        createdAt: { lt: new Date(now - RETENTION_MS) },
      },
    });
  }
}

/** SMTP 5xx: the address or message is rejected; retrying will not help. */
function isPermanentFailure(error: unknown): boolean {
  const code = (error as { responseCode?: unknown } | null)?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}

/** Short, PII-free description: SMTP code or error class. */
export function errorCode(error: unknown): string {
  const e = error as { responseCode?: unknown; code?: unknown; name?: unknown };
  if (typeof e?.responseCode === 'number') return `SMTP_${e.responseCode}`;
  if (typeof e?.code === 'string') return e.code.slice(0, 40);
  if (typeof e?.name === 'string') return e.name.slice(0, 40);
  return 'UnknownError';
}
