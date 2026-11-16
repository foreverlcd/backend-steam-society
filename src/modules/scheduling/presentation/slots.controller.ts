import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../../shared/http/public.decorator.js';
import { SlotsService } from '../application/slots.service.js';
import { slotsQuerySchema, type SlotsQuery } from './scheduling.schemas.js';

@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('mentors')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Public()
  @Get(':id/slots')
  getSlots(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query({ schema: slotsQuerySchema }) query: SlotsQuery,
  ) {
    return this.slots.getPublicSlots(id, query);
  }
}
