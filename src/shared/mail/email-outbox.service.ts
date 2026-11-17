import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface EmailToQueue {
  /** Template id, e.g. `auth.password_reset` or `booking.accepted`. */
  kind: string;
  to: string;
  subject: string;
  text: string;
  /** Do not send after this instant (links that expire). */
  expiresAt?: Date | null;
  /** Queuing the same key again does nothing (safe retries of the caller). */
  dedupeKey?: string;
}

/**
 * Queues e-mail. Pass the transaction client to queue it atomically with the
 * change that caused it; the dispatcher sends it with retries.
 */
@Injectable()
export class EmailOutbox {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async enqueue(
    email: EmailToQueue,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const now = this.clock.now();
    await client.emailOutbox.createMany({
      skipDuplicates: true,
      data: {
        dedupeKey: email.dedupeKey ?? null,
        kind: email.kind,
        toAddress: email.to,
        subject: email.subject,
        body: email.text,
        expiresAt: email.expiresAt ?? null,
        // Same clock as the dispatcher, so "due now" is consistent.
        createdAt: now,
        nextAttemptAt: now,
      },
    });
  }
}
