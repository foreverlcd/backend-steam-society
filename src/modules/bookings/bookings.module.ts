import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { BookingsService } from './application/bookings.service.js';
import { BOOKING_REPOSITORY } from './application/ports/booking.repository.js';
import { MENTEE_PROFILE_PORT } from './application/ports/mentee-profile.port.js';
import { NOTIFICATIONS_PORT } from './application/ports/notifications.port.js';
import { BookingsExpirationTask } from './infrastructure/bookings-expiration.task.js';
import { MailNotificationsAdapter } from './infrastructure/mail-notifications.adapter.js';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository.js';
import { ProfilesMenteeProfileAdapter } from './infrastructure/profiles-mentee-profile.adapter.js';
import { BookingsController } from './presentation/bookings.controller.js';

@Module({
  imports: [PrismaModule, SchedulingModule, ProfilesModule, AuthModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingsExpirationTask,
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: MENTEE_PROFILE_PORT, useClass: ProfilesMenteeProfileAdapter },
    { provide: NOTIFICATIONS_PORT, useClass: MailNotificationsAdapter },
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class BookingsModule {}
