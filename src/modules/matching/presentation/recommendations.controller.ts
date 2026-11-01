import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { RecommendationsService } from '../application/recommendations.service.js';
import {
  recommendationsQuerySchema,
  type RecommendationsQuery,
} from './matching.schemas.js';

@Controller('me/recommendations')
@Roles('mentee')
export class RecommendationsController {
  constructor(
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Query({ schema: recommendationsQuerySchema })
    query: RecommendationsQuery,
  ) {
    return this.recommendations.getRecommendations(user, query.limit);
  }
}
