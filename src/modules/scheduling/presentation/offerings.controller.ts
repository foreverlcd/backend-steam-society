import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { OfferingsService } from '../application/offerings.service.js';
import {
  createOfferingSchema,
  updateOfferingSchema,
  type CreateOfferingBody,
  type UpdateOfferingBody,
} from './scheduling.schemas.js';

@Controller('me/offerings')
@Roles('mentor')
export class OfferingsController {
  constructor(private readonly offerings: OfferingsService) {}

  @Get()
  listOwn(@CurrentUser() user: AuthUser) {
    return this.offerings.listOwn(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createOfferingSchema }) body: CreateOfferingBody,
  ) {
    return this.offerings.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: updateOfferingSchema }) body: UpdateOfferingBody,
  ) {
    return this.offerings.update(user, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.offerings.archive(user, id);
  }
}
