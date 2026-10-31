import { describe, expect, it } from 'vitest';
import {
  InvalidBookingTransitionError,
  transitionBooking,
  type BookingEvent,
  type BookingStatus,
} from './booking-status.js';

const statuses: BookingStatus[] = [
  'requested',
  'awaiting_payment',
  'confirmed',
  'declined',
  'cancelled',
  'expired',
  'completed',
  'no_show',
];

const context = {
  now: new Date('2026-11-01T11:00:00.000Z'),
  startsAt: new Date('2026-11-01T09:00:00.000Z'),
  endsAt: new Date('2026-11-01T10:00:00.000Z'),
  expiresAt: new Date('2026-10-31T10:00:00.000Z'),
  paymentRequired: false,
};

const events: Array<{ key: string; event: BookingEvent }> = [
  { key: 'accept_free', event: { type: 'accept', paymentRequired: false } },
  { key: 'accept_paid', event: { type: 'accept', paymentRequired: true } },
  { key: 'decline', event: { type: 'decline' } },
  { key: 'cancel_mentee', event: { type: 'cancel', actor: 'mentee' } },
  { key: 'cancel_mentor', event: { type: 'cancel', actor: 'mentor' } },
  { key: 'expire', event: { type: 'expire' } },
  { key: 'confirm_payment', event: { type: 'confirm_payment' } },
  { key: 'complete', event: { type: 'complete' } },
  { key: 'no_show', event: { type: 'no_show', party: 'mentee' } },
];

const valid: Record<BookingStatus, Record<string, BookingStatus>> = {
  requested: {
    accept_free: 'confirmed',
    accept_paid: 'awaiting_payment',
    decline: 'declined',
    cancel_mentee: 'cancelled',
    expire: 'expired',
  },
  awaiting_payment: {
    cancel_mentee: 'cancelled',
    expire: 'expired',
    confirm_payment: 'confirmed',
  },
  confirmed: {
    cancel_mentee: 'cancelled',
    cancel_mentor: 'cancelled',
    complete: 'completed',
    no_show: 'no_show',
  },
  declined: {},
  cancelled: {},
  expired: {},
  completed: {},
  no_show: {},
};

describe('transitionBooking', () => {
  for (const current of statuses) {
    for (const { key, event } of events) {
      const expected = valid[current][key];

      if (expected) {
        it(`allows ${current} + ${key} -> ${expected}`, () => {
          expect(
            transitionBooking(current, event, {
              ...context,
              now:
                event.type === 'cancel'
                  ? new Date('2026-11-01T08:00:00.000Z')
                  : context.now,
              paymentRequired:
                event.type === 'accept'
                  ? event.paymentRequired
                  : event.type === 'confirm_payment',
            }),
          ).toBe(expected);
        });
      } else {
        it(`rejects ${current} + ${key}`, () => {
          expect(() =>
            transitionBooking(current, event, {
              ...context,
              now:
                event.type === 'cancel'
                  ? new Date('2026-11-01T08:00:00.000Z')
                  : context.now,
              paymentRequired:
                event.type === 'accept'
                  ? event.paymentRequired
                  : event.type === 'confirm_payment',
            }),
          ).toThrow(InvalidBookingTransitionError);
        });
      }
    }
  }

  it('rejects expiring before the deadline', () => {
    expect(() =>
      transitionBooking('requested', { type: 'expire' }, {
        ...context,
        now: new Date('2026-10-31T09:59:59.999Z'),
      }),
    ).toThrow(InvalidBookingTransitionError);
  });

  it('rejects completing before the session ends', () => {
    expect(() =>
      transitionBooking('confirmed', { type: 'complete' }, {
        ...context,
        now: new Date('2026-11-01T09:59:59.999Z'),
      }),
    ).toThrow(InvalidBookingTransitionError);
  });

  it('rejects a no-show before the session starts', () => {
    expect(() =>
      transitionBooking(
        'confirmed',
        { type: 'no_show', party: 'mentee' },
        {
          ...context,
          now: new Date('2026-11-01T09:00:00.000Z'),
        },
      ),
    ).toThrow(InvalidBookingTransitionError);
  });

  it('rejects cancelling a free confirmed booking after it starts', () => {
    expect(() =>
      transitionBooking(
        'confirmed',
        { type: 'cancel', actor: 'mentee' },
        {
          ...context,
          now: new Date('2026-11-01T09:00:00.000Z'),
          paymentRequired: false,
        },
      ),
    ).toThrow(InvalidBookingTransitionError);
  });

  it('allows cancelling a paid confirmed booking after it starts until DA-05', () => {
    expect(
      transitionBooking(
        'confirmed',
        { type: 'cancel', actor: 'mentor' },
        {
          ...context,
          now: new Date('2026-11-01T09:30:00.000Z'),
          paymentRequired: true,
        },
      ),
    ).toBe('cancelled');
  });

  it('rejects confirming payment on a free booking', () => {
    expect(() =>
      transitionBooking('awaiting_payment', { type: 'confirm_payment' }, {
        ...context,
        paymentRequired: false,
      }),
    ).toThrow(InvalidBookingTransitionError);
  });
});
