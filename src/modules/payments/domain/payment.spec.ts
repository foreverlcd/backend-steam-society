import {
  canRestartCheckout,
  canSettle,
  idempotencyKeyFor,
  splitFee,
  type PaymentStatus,
} from './payment.js';

describe('splitFee', () => {
  it.each([
    [10_000, 1_500, 1_500, 8_500],
    [5_000, 0, 0, 5_000],
    [5_000, 10_000, 5_000, 0],
    [1, 1_500, 0, 1],
    [3, 5_000, 2, 1],
    [999, 1_500, 150, 849],
  ])(
    'splits %i with %i bps into fee %i and net %i',
    (amount, bps, fee, net) => {
      expect(splitFee(amount, bps)).toEqual({ feeMinor: fee, netMinor: net });
    },
  );

  it('always keeps fee + net equal to the amount', () => {
    for (let amount = 1; amount <= 2_000; amount += 7) {
      for (const bps of [0, 1, 250, 1_500, 3_333, 9_999, 10_000]) {
        const { feeMinor, netMinor } = splitFee(amount, bps);
        expect(feeMinor + netMinor).toBe(amount);
        expect(feeMinor).toBeGreaterThanOrEqual(0);
        expect(netMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects amount %s', (amount) => {
    expect(() => splitFee(amount, 1_500)).toThrow(RangeError);
  });

  it.each([-1, 10_001, 1.5])('rejects fee bps %s', (bps) => {
    expect(() => splitFee(1_000, bps)).toThrow(RangeError);
  });
});

describe('payment status rules', () => {
  const all: PaymentStatus[] = ['created', 'pending', 'paid', 'failed'];

  it('only settles created or pending payments', () => {
    expect(all.filter(canSettle)).toEqual(['created', 'pending']);
  });

  it('only restarts created or failed payments', () => {
    expect(all.filter(canRestartCheckout)).toEqual(['created', 'failed']);
  });

  it('derives a stable idempotency key from the booking', () => {
    expect(idempotencyKeyFor('abc')).toBe('booking:abc');
  });
});
