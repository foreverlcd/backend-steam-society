import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AvailabilityService } from './application/availability.service.js';
import { OfferingsService } from './application/offerings.service.js';
import { MENTOR_SETTINGS_PORT } from './application/ports/mentor-settings.port.js';
import { SESSION_CONFLICT_PORT } from './application/ports/session-conflict.port.js';
import { SCHEDULING_REPOSITORY } from './application/ports/scheduling.repository.js';
import { SlotsService } from './application/slots.service.js';
import { NoSessionConflictAdapter } from './infrastructure/no-session-conflict.adapter.js';
import { PrismaSchedulingRepository } from './infrastructure/prisma-scheduling.repository.js';
import { ProfilesMentorSettingsAdapter } from './infrastructure/profiles-mentor-settings.adapter.js';
import { AvailabilityController } from './presentation/availability.controller.js';
import { OfferingsController } from './presentation/offerings.controller.js';
import { SlotsController } from './presentation/slots.controller.js';

@Module({
  imports: [PrismaModule, ProfilesModule],
  controllers: [OfferingsController, AvailabilityController, SlotsController],
  providers: [
    OfferingsService,
    AvailabilityService,
    SlotsService,
    { provide: SCHEDULING_REPOSITORY, useClass: PrismaSchedulingRepository },
    { provide: MENTOR_SETTINGS_PORT, useClass: ProfilesMentorSettingsAdapter },
    { provide: SESSION_CONFLICT_PORT, useClass: NoSessionConflictAdapter },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [SlotsService],
})
export class SchedulingModule {}
