export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed';

export type PaymentOutcome = 'paid' | 'failed';

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  providerRef: string | null;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  feeBps: number;
  feeMinor: number;
  netMinor: number;
  idempotencyKey: string;
  checkoutUrl: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeSplit {
  feeMinor: number;
  netMinor: number;
}

/**
 * Platform fee in basis points, rounded half up to the minor unit (ADR-009).
 * `fee + net` always equals `amount`, which the database also checks.
 */
export function splitFee(amountMinor: number, feeBps: number): FeeSplit {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError('amountMinor must be a positive integer');
  }

  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new RangeError('feeBps must be an integer between 0 and 10000');
  }

  const feeMinor = Math.floor((amountMinor * feeBps + 5_000) / 10_000);

  return { feeMinor, netMinor: amountMinor - feeMinor };
}

/** States from which a provider result can still be applied. */
export const SETTLEABLE_STATUSES: readonly PaymentStatus[] = [
  'created',
  'pending',
];

/** States from which a new checkout may be opened for the same booking. */
export const RESTARTABLE_STATUSES: readonly PaymentStatus[] = [
  'created',
  'failed',
];

export function canSettle(status: PaymentStatus): boolean {
  return SETTLEABLE_STATUSES.includes(status);
}

export function canRestartCheckout(status: PaymentStatus): boolean {
  return RESTARTABLE_STATUSES.includes(status);
}

export function idempotencyKeyFor(bookingId: string): string {
  return `booking:${bookingId}`;
}
