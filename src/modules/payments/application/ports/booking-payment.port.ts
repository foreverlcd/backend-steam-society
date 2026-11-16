import type { AuthUser } from '../../../auth/auth.types.js';

export const BOOKING_PAYMENT_PORT = Symbol('BOOKING_PAYMENT_PORT');

export interface PayableBooking {
  id: string;
  priceMinor: number;
  currency: string;
  offeringTitle: string;
}

/**
 * The only way payments talks to bookings. Bookings does not know payments
 * exists, so this module can be removed or replaced without touching it.
 */
export interface BookingPaymentPort {
  /** Throws the bookings HTTP errors when the user cannot pay it. */
  findPayable(user: AuthUser, bookingId: string): Promise<PayableBooking>;
  confirmPaid(bookingId: string): Promise<void>;
}
