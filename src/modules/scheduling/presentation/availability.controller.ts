import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { AvailabilityService } from '../application/availability.service.js';
import {
  replaceAvailabilitySchema,
  type ReplaceAvailabilityBody,
} from './scheduling.schemas.js';

@Controller('me/availability')
@Roles('mentor')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.availability.get(user);
  }

  @Put()
  replace(
    @CurrentUser() user: AuthUser,
    @Body({ schema: replaceAvailabilitySchema })
    body: ReplaceAvailabilityBody,
  ) {
    return this.availability.replace(user, body);
  }
}
