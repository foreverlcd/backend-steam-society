import type { PaymentOutcome } from '../../domain/payment.js';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateCheckoutInput {
  paymentId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface GatewayEvent {
  eventId: string;
  providerRef: string;
  outcome: PaymentOutcome;
  payload: Record<string, unknown>;
}

/** Thrown when a webhook cannot be authenticated or parsed. */
export class InvalidWebhookError extends Error {
  constructor(message = 'Invalid webhook') {
    super(message);
    this.name = 'InvalidWebhookError';
  }
}

/** Thrown when payments are switched off (`PAYMENTS_PROVIDER=disabled`). */
export class PaymentsDisabledError extends Error {
  constructor() {
    super('Payments are disabled');
    this.name = 'PaymentsDisabledError';
  }
}

/**
 * Port for the payment provider (ADR-010). A real provider (Mercado Pago,
 * Culqi, Izipay...) is added as a new adapter; nothing else changes.
 */
export interface PaymentGateway {
  readonly provider: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  parseWebhook(request: WebhookRequest): Promise<GatewayEvent>;
}
