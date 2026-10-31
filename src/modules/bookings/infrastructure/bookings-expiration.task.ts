import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BookingsService } from '../application/bookings.service.js';

const EXPIRATION_INTERVAL_MS = 60_000;

@Injectable()
export class BookingsExpirationTask {
  private readonly logger = new Logger(BookingsExpirationTask.name);

  constructor(private readonly bookings: BookingsService) {}

  @Interval(EXPIRATION_INTERVAL_MS)
  async expireDue(): Promise<void> {
    try {
      const expired = await this.bookings.expireDue();

      if (expired > 0) {
        this.logger.log(`Expired ${expired} booking request(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Booking expiration failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
