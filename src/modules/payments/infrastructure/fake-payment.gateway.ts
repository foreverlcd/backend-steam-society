import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  InvalidWebhookError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type GatewayEvent,
  type PaymentGateway,
  type WebhookRequest,
} from '../application/ports/payment-gateway.port.js';

const fakeWebhookSchema = z
  .object({
    eventId: z.string().trim().min(1).max(128),
    providerRef: z.string().startsWith('fake_').max(128),
    outcome: z.enum(['paid', 'failed']),
  })
  .strict();

/**
 * Development-only provider. The checkout page lives in the web app and
 * posts an unsigned webhook, so env validation forbids it in production.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly provider = 'fake';

  constructor(private readonly appUrl: string) {}

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const providerRef = `fake_${input.paymentId}_${randomUUID().slice(0, 8)}`;
    const url = new URL('/payments/fake-checkout', this.appUrl);
    url.searchParams.set('ref', providerRef);
    url.searchParams.set('amount', String(input.amountMinor));
    url.searchParams.set('currency', input.currency);

    return Promise.resolve({ providerRef, checkoutUrl: url.toString() });
  }

  parseWebhook(request: WebhookRequest): Promise<GatewayEvent> {
    const parsed = fakeWebhookSchema.safeParse(request.body);

    if (!parsed.success) {
      return Promise.reject(new InvalidWebhookError());
    }

    return Promise.resolve({ ...parsed.data, payload: parsed.data });
  }
}
