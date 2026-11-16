import type {
  Payment,
  PaymentOutcome,
  PaymentStatus,
} from '../../domain/payment.js';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface CreatePaymentData {
  bookingId: string;
  provider: string;
  amountMinor: number;
  currency: string;
  feeBps: number;
  feeMinor: number;
  netMinor: number;
  idempotencyKey: string;
}

export interface CheckoutOpenedData {
  providerRef: string;
  checkoutUrl: string;
}

export interface PaymentRepositoryPort {
  findByBookingId(bookingId: string): Promise<Payment | null>;
  /** Returns the existing row if another request created it first. */
  createOrGet(data: CreatePaymentData): Promise<Payment>;
  /** `UPDATE ... WHERE status IN (from)`; null if the status changed. */
  markCheckoutOpened(
    id: string,
    from: readonly PaymentStatus[],
    data: CheckoutOpenedData,
  ): Promise<Payment | null>;
  /** Records the webhook once; false if `(provider, eventId)` was processed. */
  recordWebhook(
    provider: string,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean>;
  markWebhookProcessed(
    provider: string,
    eventId: string,
    at: Date,
  ): Promise<void>;
  /** Applies the outcome only from a settleable status; null otherwise. */
  settle(
    provider: string,
    providerRef: string,
    outcome: PaymentOutcome,
    at: Date,
  ): Promise<Payment | null>;
  findByProviderRef(
    provider: string,
    providerRef: string,
  ): Promise<Payment | null>;
}
