import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BookingsService } from '../application/bookings.service.js';

const REMINDER_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class BookingsReminderTask {
  private readonly logger = new Logger(BookingsReminderTask.name);

  constructor(private readonly bookings: BookingsService) {}

  @Interval(REMINDER_INTERVAL_MS)
  async sendDueReminders(): Promise<void> {
    try {
      const reminded = await this.bookings.sendDueReminders();
      if (reminded > 0) {
        this.logger.log(`Queued reminders for ${reminded} booking(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Booking reminders failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
