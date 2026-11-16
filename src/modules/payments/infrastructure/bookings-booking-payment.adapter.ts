import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types.js';
import { BookingsService } from '../../bookings/application/bookings.service.js';
import type {
  BookingPaymentPort,
  PayableBooking,
} from '../application/ports/booking-payment.port.js';

@Injectable()
export class BookingsBookingPaymentAdapter implements BookingPaymentPort {
  constructor(private readonly bookings: BookingsService) {}

  async findPayable(
    user: AuthUser,
    bookingId: string,
  ): Promise<PayableBooking> {
    const booking = await this.bookings.getPayable(user, bookingId);

    return {
      id: booking.id,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
      offeringTitle: booking.offeringTitle,
    };
  }

  async confirmPaid(bookingId: string): Promise<void> {
    await this.bookings.confirmPayment(bookingId);
  }
}
