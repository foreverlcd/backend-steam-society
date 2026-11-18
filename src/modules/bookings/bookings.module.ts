import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { BookingsService } from './application/bookings.service.js';
import { CallsService } from './application/calls.service.js';
import {
  CALL_SIGNALING_PORT,
  ICE_SERVERS_PORT,
} from './application/ports/call-signaling.port.js';
import { ConfiguredIceServers } from './infrastructure/ice-servers.js';
import { InMemoryCallSignaling } from './infrastructure/in-memory-call-signaling.js';
import { CallsController } from './presentation/calls.controller.js';
import { BOOKING_REPOSITORY } from './application/ports/booking.repository.js';
import { MENTEE_PROFILE_PORT } from './application/ports/mentee-profile.port.js';
import { NOTIFICATIONS_PORT } from './application/ports/notifications.port.js';
import { BookingsExpirationTask } from './infrastructure/bookings-expiration.task.js';
import { BookingsReminderTask } from './infrastructure/bookings-reminder.task.js';
import { MailNotificationsAdapter } from './infrastructure/mail-notifications.adapter.js';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository.js';
import { ProfilesMenteeProfileAdapter } from './infrastructure/profiles-mentee-profile.adapter.js';
import { BookingsController } from './presentation/bookings.controller.js';
import { BookingsPersonalData } from './infrastructure/bookings-personal-data.js';

@Module({
  imports: [PrismaModule, SchedulingModule, ProfilesModule, AuthModule],
  controllers: [BookingsController, CallsController],
  providers: [
    BookingsPersonalData,
    BookingsService,
    CallsService,
    { provide: CALL_SIGNALING_PORT, useClass: InMemoryCallSignaling },
    { provide: ICE_SERVERS_PORT, useClass: ConfiguredIceServers },
    BookingsExpirationTask,
    BookingsReminderTask,
    { provide: BOOKING_REPOSITORY, useClass: PrismaBookingRepository },
    { provide: MENTEE_PROFILE_PORT, useClass: ProfilesMenteeProfileAdapter },
    { provide: NOTIFICATIONS_PORT, useClass: MailNotificationsAdapter },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
