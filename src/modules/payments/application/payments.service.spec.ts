import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../../auth/auth.types.js';
import type { Payment } from '../domain/payment.js';
import { DisabledPaymentGateway } from '../infrastructure/disabled-payment.gateway.js';
import { FakePaymentGateway } from '../infrastructure/fake-payment.gateway.js';
import { PaymentsService } from './payments.service.js';
import type { BookingPaymentPort } from './ports/booking-payment.port.js';
import type { PaymentGateway } from './ports/payment-gateway.port.js';
import type { PaymentRepositoryPort } from './ports/payment.repository.js';

const NOW = new Date('2026-11-16T12:00:00.000Z');

const mentee: AuthUser = {
  id: 'mentee-1',
  email: 'mentee@example.com',
  role: 'mentee',
  status: 'active',
  firstName: 'Lucía',
  lastName: null,
  birthDate: null,
  emailVerified: true,
  mfaEnabled: false,
};

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    bookingId: 'booking-1',
    provider: 'fake',
    providerRef: null,
    status: 'created',
    amountMinor: 5000,
    currency: 'PEN',
    feeBps: 1500,
    feeMinor: 750,
    netMinor: 4250,
    idempotencyKey: 'booking:booking-1',
    checkoutUrl: null,
    paidAt: null,
    failedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function errorCode(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return (response as { code?: string } | undefined)?.code;
}

describe('PaymentsService', () => {
  let repository: {
    [K in keyof PaymentRepositoryPort]: ReturnType<typeof vi.fn>;
  };
  let errorLog: ReturnType<typeof vi.spyOn>;
  let bookings: { [K in keyof BookingPaymentPort]: ReturnType<typeof vi.fn> };

  function build(gateway: PaymentGateway): PaymentsService {
    return new PaymentsService(
      gateway,
      repository as unknown as PaymentRepositoryPort,
      bookings as unknown as BookingPaymentPort,
      { now: () => NOW },
      {
        getOrThrow: (key: string) =>
          key === 'PAYMENTS_FEE_BPS' ? 1500 : 'http://localhost:3001',
      } as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository = {
      findByBookingId: vi.fn(),
      createOrGet: vi.fn().mockResolvedValue(makePayment()),
      markCheckoutOpened: vi.fn(async (_id, _from, data) =>
        makePayment({ status: 'pending', ...data }),
      ),
      recordWebhook: vi.fn().mockResolvedValue(true),
      markWebhookProcessed: vi.fn().mockResolvedValue(undefined),
      settle: vi.fn(),
      findByProviderRef: vi.fn(),
    };
    bookings = {
      findPayable: vi.fn().mockResolvedValue({
        id: 'booking-1',
        priceMinor: 5000,
        currency: 'PEN',
        offeringTitle: 'Mentoría',
      }),
      confirmPaid: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('answers 503 when payments are disabled, without touching bookings', async () => {
    const service = build(new DisabledPaymentGateway());

    await expect(service.startCheckout(mentee, 'booking-1')).rejects.toSatisfy(
      (error) => errorCode(error) === 'PAYMENTS_DISABLED',
    );
    expect(bookings.findPayable).not.toHaveBeenCalled();
  });

  it('stores the fee split and opens a checkout', async () => {
    const service = build(new FakePaymentGateway('http://localhost:3001'));

    const result = await service.startCheckout(mentee, 'booking-1');

    expect(repository.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5000,
        feeBps: 1500,
        feeMinor: 750,
        netMinor: 4250,
        idempotencyKey: 'booking:booking-1',
      }),
    );
    expect(result.status).toBe('pending');
    expect(result.checkoutUrl).toContain('/payments/fake-checkout?ref=fake_');
  });

  it('does not confirm the booking when the charge failed', async () => {
    const service = build(new FakePaymentGateway('http://localhost:3001'));
    repository.settle.mockResolvedValue(makePayment({ status: 'failed' }));

    await service.handleWebhook('fake', {
      headers: {},
      body: { eventId: 'e1', providerRef: 'fake_x', outcome: 'failed' },
    });

    expect(bookings.confirmPaid).not.toHaveBeenCalled();
    expect(repository.markWebhookProcessed).toHaveBeenCalledWith(
      'fake',
      'e1',
      NOW,
    );
  });

  it('keeps the payment when the booking can no longer be confirmed', async () => {
    const service = build(new FakePaymentGateway('http://localhost:3001'));
    repository.settle.mockResolvedValue(
      makePayment({ status: 'paid', paidAt: NOW }),
    );
    bookings.confirmPaid.mockRejectedValue(new Error('expired'));

    await expect(
      service.handleWebhook('fake', {
        headers: {},
        body: { eventId: 'e2', providerRef: 'fake_x', outcome: 'paid' },
      }),
    ).resolves.toEqual({ received: true, duplicate: false });
    expect(errorLog).toHaveBeenCalled();
  });

  it('rejects a webhook for another provider', async () => {
    const service = build(new FakePaymentGateway('http://localhost:3001'));

    await expect(
      service.handleWebhook('culqi', { headers: {}, body: {} }),
    ).rejects.toSatisfy(
      (error) => errorCode(error) === 'PAYMENT_PROVIDER_NOT_FOUND',
    );
  });
});
