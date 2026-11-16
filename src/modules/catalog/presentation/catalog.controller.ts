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
import {
  publicMentorQuerySchema,
  type PublicMentorQuery,
} from '../../profiles/profiles.schemas.js';
import { CatalogService } from '../application/catalog.service.js';

@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('mentors')
@Public()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query({ schema: publicMentorQuerySchema }) query: PublicMentorQuery) {
    return this.catalog.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.get(id);
  }
}
