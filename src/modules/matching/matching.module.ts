import { Module } from '@nestjs/common';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { RecommendationsService } from './application/recommendations.service.js';
import {
  DEFAULT_MATCHING_CONFIG,
  MATCHING_CONFIG,
} from './domain/matching.config.js';
import { RecommendationsController } from './presentation/recommendations.controller.js';

@Module({
  imports: [ProfilesModule, SchedulingModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    { provide: MATCHING_CONFIG, useValue: DEFAULT_MATCHING_CONFIG },
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class MatchingModule {}
