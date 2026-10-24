import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import {
  AdminMentorsController,
  ProfilesController,
} from './profiles.controller.js';
import { ProfilesRepository } from './profiles.repository.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProfilesController, AdminMentorsController],
  providers: [
    ProfilesService,
    ProfilesRepository,
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class ProfilesModule {}
