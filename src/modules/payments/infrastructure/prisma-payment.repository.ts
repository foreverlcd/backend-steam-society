import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  SETTLEABLE_STATUSES,
  type Payment,
  type PaymentOutcome,
  type PaymentStatus,
} from '../domain/payment.js';
import type {
  CheckoutOpenedData,
  CreatePaymentData,
  PaymentRepositoryPort,
} from '../application/ports/payment.repository.js';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByBookingId(bookingId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { bookingId } });
  }

  async findByProviderRef(
    provider: string,
    providerRef: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { provider, providerRef } });
  }

  async createOrGet(data: CreatePaymentData): Promise<Payment> {
    const existing = await this.findByBookingId(data.bookingId);

    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.payment.create({ data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const winner = await this.findByBookingId(data.bookingId);

        if (winner) {
          return winner;
        }
      }

      throw error;
    }
  }

  async markCheckoutOpened(
    id: string,
    from: readonly PaymentStatus[],
    data: CheckoutOpenedData,
  ): Promise<Payment | null> {
    const result = await this.prisma.payment.updateMany({
      where: { id, status: { in: [...from] } },
      data: {
        status: 'pending',
        providerRef: data.providerRef,
        checkoutUrl: data.checkoutUrl,
        failedAt: null,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.prisma.payment.findUnique({ where: { id } });
  }

  async recordWebhook(
    provider: string,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "webhook_event" ("provider", "event_id", "payload")
      VALUES (${provider}, ${eventId}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT ("provider", "event_id") DO NOTHING
    `;

    if (inserted === 1) {
      return true;
    }

    // Seen before: reprocess only if the previous attempt never finished.
    const previous = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
      select: { processedAt: true },
    });

    return previous?.processedAt === null;
  }

  async markWebhookProcessed(
    provider: string,
    eventId: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { provider, eventId, processedAt: null },
      data: { processedAt: at },
    });
  }

  async settle(
    provider: string,
    providerRef: string,
    outcome: PaymentOutcome,
    at: Date,
  ): Promise<Payment | null> {
    const result = await this.prisma.payment.updateMany({
      where: {
        provider,
        providerRef,
        status: { in: [...SETTLEABLE_STATUSES] },
      },
      data:
        outcome === 'paid'
          ? { status: 'paid', paidAt: at }
          : { status: 'failed', failedAt: at },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.findByProviderRef(provider, providerRef);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
