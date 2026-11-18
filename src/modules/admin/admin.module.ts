import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/** Pilot operations for the team: overview, people and bookings. */
@Module({
  imports: [PrismaModule, BookingsModule],
  controllers: [AdminController],
  providers: [AdminService, { provide: CLOCK, useClass: SystemClock }],
})
export class AdminModule {}
