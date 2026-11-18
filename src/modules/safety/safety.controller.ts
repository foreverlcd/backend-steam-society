import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '../../shared/http/roles.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ModerationService } from './moderation.service.js';
import { SafetyService } from './safety.service.js';
import {
  blockUserSchema,
  createReportSchema,
  listReportsQuerySchema,
  resolveReportSchema,
  suspendUserSchema,
  type BlockUserBody,
  type CreateReportBody,
  type ListReportsQuery,
  type ResolveReportBody,
  type SuspendUserBody,
} from './safety.schemas.js';

@Controller('me/blocks')
export class BlocksController {
  constructor(private readonly safety: SafetyService) {}

  @Get()
  @Roles('mentee', 'mentor')
  list(@CurrentUser() user: AuthUser) {
    return this.safety.listBlocks(user);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post()
  @Roles('mentee', 'mentor')
  block(
    @CurrentUser() user: AuthUser,
    @Body({ schema: blockUserSchema }) body: BlockUserBody,
  ) {
    return this.safety.block(user, body.userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  @Roles('mentee', 'mentor')
  async unblock(
    @CurrentUser() user: AuthUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.safety.unblock(user, userId);
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly safety: SafetyService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  @Roles('mentee', 'mentor')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createReportSchema }) body: CreateReportBody,
  ) {
    return this.safety.report(user, body);
  }
}

@Controller('admin')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('reports')
  @Roles('admin')
  list(@Query({ schema: listReportsQuerySchema }) query: ListReportsQuery) {
    return this.moderation.listReports(query);
  }

  @Get('reports/:id')
  @Roles('admin')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.moderation.getReport(id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @Roles('admin')
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: resolveReportSchema }) body: ResolveReportBody,
  ) {
    return this.moderation.resolveReport(admin, id, body);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @Roles('admin')
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: suspendUserSchema }) body: SuspendUserBody,
  ) {
    return this.moderation.suspendUser(admin, id, body.reason);
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  @Roles('admin')
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.moderation.reactivateUser(admin, id);
  }
}
