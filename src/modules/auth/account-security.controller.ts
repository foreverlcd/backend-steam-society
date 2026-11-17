import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
} from './auth.schemas.js';
import type { AuthUser } from './auth.types.js';
import { AccountSecurityService } from './account-security.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { ActiveSession } from './session.repository.js';

const PUBLIC_SESSION_ID = /^[0-9a-f]{32}$/;

/** Self-service security: sessions, password and e-mail (F2). */
@Controller('me')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AccountSecurityController {
  constructor(private readonly accountSecurity: AccountSecurityService) {}

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ActiveSession[]> {
    return this.accountSecurity.listSessions(user, request.sessionID);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOtherSessions(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<{ revoked: number }> {
    return {
      revoked: await this.accountSecurity.revokeOtherSessions(
        user,
        request.sessionID,
      ),
    };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    if (!PUBLIC_SESSION_ID.test(id)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SESSION_ID',
        message: 'Invalid session id',
      });
    }
    await this.accountSecurity.revokeSession(user, id);
  }

  @Post('password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @Req() request: Request,
  ): Promise<void> {
    await this.accountSecurity.changePassword(
      user,
      { password: body.password, code: body.code },
      body.newPassword,
      request.sessionID,
    );
  }

  @Post('email')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestEmailChange(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changeEmailSchema }) body: ChangeEmailInput,
  ): Promise<{ status: string }> {
    await this.accountSecurity.requestEmailChange(
      user,
      { password: body.password, code: body.code },
      body.newEmail,
    );
    return { status: 'accepted' };
  }
}
