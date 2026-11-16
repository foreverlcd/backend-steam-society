import {
  PaymentsDisabledError,
  type CheckoutSession,
  type GatewayEvent,
  type PaymentGateway,
} from '../application/ports/payment-gateway.port.js';

/** Default adapter: the pilot runs with free sessions only (F0, question 1). */
export class DisabledPaymentGateway implements PaymentGateway {
  readonly provider = 'disabled';

  createCheckout(): Promise<CheckoutSession> {
    return Promise.reject(new PaymentsDisabledError());
  }

  parseWebhook(): Promise<GatewayEvent> {
    return Promise.reject(new PaymentsDisabledError());
  }
}
