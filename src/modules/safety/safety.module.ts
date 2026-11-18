import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ModerationService } from './moderation.service.js';
import { SafetyPersonalData } from './safety-personal-data.js';
import {
  BlocksController,
  ModerationController,
  ReportsController,
} from './safety.controller.js';
import { SafetyService } from './safety.service.js';

/** Trust & safety: blocks, reports and moderation (ADR-029). */
@Module({
  imports: [PrismaModule, AuthModule, BookingsModule],
  controllers: [BlocksController, ReportsController, ModerationController],
  providers: [
    SafetyService,
    ModerationService,
    SafetyPersonalData,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [ModerationService],
})
export class SafetyModule {}
