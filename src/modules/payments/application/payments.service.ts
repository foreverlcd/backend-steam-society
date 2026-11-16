import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  canRestartCheckout,
  idempotencyKeyFor,
  splitFee,
  type Payment,
  type PaymentStatus,
} from '../domain/payment.js';
import {
  BOOKING_PAYMENT_PORT,
  type BookingPaymentPort,
} from './ports/booking-payment.port.js';
import {
  InvalidWebhookError,
  PAYMENT_GATEWAY,
  PaymentsDisabledError,
  type PaymentGateway,
  type WebhookRequest,
} from './ports/payment-gateway.port.js';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepositoryPort,
} from './ports/payment.repository.js';
import {
  invalidWebhook,
  paymentAlreadyPaid,
  paymentProviderNotFound,
  paymentsDisabled,
  paymentStatusConflict,
} from './payments.errors.js';

export interface CheckoutResponse {
  paymentId: string;
  bookingId: string;
  status: PaymentStatus;
  provider: string;
  amountMinor: number;
  currency: string;
  checkoutUrl: string;
}

export interface WebhookResult {
  received: true;
  duplicate: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly feeBps: number;
  private readonly appUrl: string;

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(PAYMENT_REPOSITORY)
    private readonly repository: PaymentRepositoryPort,
    @Inject(BOOKING_PAYMENT_PORT)
    private readonly bookings: BookingPaymentPort,
    @Inject(CLOCK) private readonly clock: Clock,
    configService: ConfigService,
  ) {
    this.feeBps = configService.getOrThrow<number>('PAYMENTS_FEE_BPS');
    this.appUrl = configService.getOrThrow<string>('APP_URL');
  }

  get provider(): string {
    return this.gateway.provider;
  }

  async startCheckout(
    user: AuthUser,
    bookingId: string,
  ): Promise<CheckoutResponse> {
    if (this.gateway.provider === 'disabled') {
      throw paymentsDisabled();
    }

    const booking = await this.bookings.findPayable(user, bookingId);
    const { feeMinor, netMinor } = splitFee(booking.priceMinor, this.feeBps);

    let payment = await this.repository.createOrGet({
      bookingId: booking.id,
      provider: this.gateway.provider,
      amountMinor: booking.priceMinor,
      currency: booking.currency,
      feeBps: this.feeBps,
      feeMinor,
      netMinor,
      idempotencyKey: idempotencyKeyFor(booking.id),
    });

    if (payment.status === 'paid') {
      throw paymentAlreadyPaid();
    }

    // Reuse an open checkout so double clicks never create two charges.
    if (payment.status === 'pending' && payment.checkoutUrl) {
      return toCheckoutResponse(payment);
    }

    if (!canRestartCheckout(payment.status)) {
      throw paymentStatusConflict();
    }

    const session = await this.callGateway(() =>
      this.gateway.createCheckout({
        paymentId: payment.id,
        idempotencyKey: `${payment.idempotencyKey}:${payment.updatedAt.getTime()}`,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        description: booking.offeringTitle,
        returnUrl: `${this.appUrl}/dashboard/bookings`,
      }),
    );

    const opened = await this.repository.markCheckoutOpened(
      payment.id,
      [payment.status],
      session,
    );

    if (!opened) {
      throw paymentStatusConflict();
    }

    payment = opened;

    return toCheckoutResponse(payment);
  }

  async handleWebhook(
    provider: string,
    request: WebhookRequest,
  ): Promise<WebhookResult> {
    if (provider !== this.gateway.provider || provider === 'disabled') {
      throw paymentProviderNotFound();
    }

    const event = await this.callGateway(() =>
      this.gateway.parseWebhook(request),
    );

    const fresh = await this.repository.recordWebhook(
      provider,
      event.eventId,
      event.payload,
    );

    if (!fresh) {
      return { received: true, duplicate: true };
    }

    const now = this.clock.now();
    const settled = await this.repository.settle(
      provider,
      event.providerRef,
      event.outcome,
      now,
    );

    if (!settled) {
      const existing = await this.repository.findByProviderRef(
        provider,
        event.providerRef,
      );

      if (!existing) {
        this.logger.warn(`Webhook for unknown payment reference (${provider})`);
      }
    } else if (settled.status === 'paid') {
      await this.confirmBooking(settled);
    }

    await this.repository.markWebhookProcessed(provider, event.eventId, now);

    return { received: true, duplicate: false };
  }

  private async confirmBooking(payment: Payment): Promise<void> {
    try {
      await this.bookings.confirmPaid(payment.bookingId);
    } catch (error) {
      // The money is captured but the booking could not be confirmed (for
      // example it expired meanwhile). Refunds arrive with Hito 2 (DA-05);
      // until then this needs manual follow-up.
      this.logger.error(
        `Paid payment ${payment.id} could not confirm its booking: ${
          error instanceof Error ? error.name : 'UnknownError'
        }`,
      );
    }
  }

  private async callGateway<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof PaymentsDisabledError) {
        throw paymentsDisabled();
      }

      if (error instanceof InvalidWebhookError) {
        throw invalidWebhook();
      }

      throw error;
    }
  }
}

function toCheckoutResponse(payment: Payment): CheckoutResponse {
  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    status: payment.status,
    provider: payment.provider,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    checkoutUrl: payment.checkoutUrl ?? '',
  };
}
