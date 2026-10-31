export type BookingStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'no_show';

export type BookingActor = 'mentee' | 'mentor';

export type BookingEvent =
  | { type: 'accept'; paymentRequired: boolean }
  | { type: 'decline' }
  | { type: 'cancel'; actor: BookingActor }
  | { type: 'expire' }
  | { type: 'confirm_payment' }
  | { type: 'complete' }
  | { type: 'no_show'; party: BookingActor };

export interface BookingTransitionContext {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  paymentRequired: boolean;
}

export class InvalidBookingTransitionError extends Error {
  constructor(
    public readonly from: BookingStatus,
    public readonly event: BookingEvent['type'],
    message: string,
  ) {
    super(message);
    this.name = 'InvalidBookingTransitionError';
  }
}

export function transitionBooking(
  current: BookingStatus,
  event: BookingEvent,
  context: BookingTransitionContext,
): BookingStatus {
  switch (event.type) {
    case 'accept':
      assertStatus(current, event.type, ['requested']);
      return context.paymentRequired ? 'awaiting_payment' : 'confirmed';

    case 'decline':
      assertStatus(current, event.type, ['requested']);
      return 'declined';

    case 'cancel':
      if (event.actor === 'mentee') {
        assertStatus(current, event.type, [
          'requested',
          'awaiting_payment',
          'confirmed',
        ]);
      } else {
        assertStatus(current, event.type, ['confirmed']);
      }

      // Free sessions can be cancelled until they start. Paid cancellations
      // are pending DA-05, so no time guard is applied yet.
      if (current === 'confirmed' && !context.paymentRequired) {
        assertBefore(current, context.now, context.startsAt, event.type, 'startsAt');
      }

      return 'cancelled';

    case 'expire':
      assertStatus(current, event.type, ['requested', 'awaiting_payment']);
      assertAfter(
        current,
        context.now,
        context.expiresAt,
        event.type,
        'expiresAt',
      );
      return 'expired';

    case 'confirm_payment':
      assertStatus(current, event.type, ['awaiting_payment']);
      if (!context.paymentRequired) {
        throw invalid(
          event.type,
          current,
          'The booking does not require payment',
        );
      }
      return 'confirmed';

    case 'complete':
      assertStatus(current, event.type, ['confirmed']);
      assertAtOrAfter(
        current,
        context.now,
        context.endsAt,
        event.type,
        'endsAt',
      );
      return 'completed';

    case 'no_show':
      assertStatus(current, event.type, ['confirmed']);
      assertAfter(
        current,
        context.now,
        context.startsAt,
        event.type,
        'startsAt',
      );
      return 'no_show';
  }
}

function assertStatus(
  current: BookingStatus,
  event: BookingEvent['type'],
  allowed: BookingStatus[],
): void {
  if (!allowed.includes(current)) {
    throw invalid(
      event,
      current,
      `Cannot apply "${event}" to a booking in status "${current}"`,
    );
  }
}

function assertAfter(
  current: BookingStatus,
  now: Date,
  boundary: Date,
  event: BookingEvent['type'],
  boundaryName: string,
): void {
  if (now.getTime() <= boundary.getTime()) {
    throw invalid(
      event,
      current,
      `The booking has not passed ${boundaryName}`,
    );
  }
}

function assertBefore(
  current: BookingStatus,
  now: Date,
  boundary: Date,
  event: BookingEvent['type'],
  boundaryName: string,
): void {
  if (now.getTime() >= boundary.getTime()) {
    throw invalid(
      event,
      current,
      `The booking has already reached ${boundaryName}`,
    );
  }
}

function assertAtOrAfter(
  current: BookingStatus,
  now: Date,
  boundary: Date,
  event: BookingEvent['type'],
  boundaryName: string,
): void {
  if (now.getTime() < boundary.getTime()) {
    throw invalid(
      event,
      current,
      `The booking has not reached ${boundaryName}`,
    );
  }
}

function invalid(
  event: BookingEvent['type'],
  current: BookingStatus,
  message: string,
): InvalidBookingTransitionError {
  return new InvalidBookingTransitionError(current, event, message);
}
