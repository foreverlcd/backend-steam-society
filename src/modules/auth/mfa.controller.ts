import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AllowWithoutMfa } from '../../shared/http/account-policy.decorators.js';
import {
  disableMfaSchema,
  totpCodeBodySchema,
  type DisableMfaInput,
  type TotpCodeBody,
} from './auth.schemas.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { MfaService, type MfaStatus, type TotpSetup } from './mfa.service.js';
import { SessionRepository } from './session.repository.js';

/** Second factor management for the signed-in user (ADR-024). */
@AllowWithoutMfa()
@Controller('me/mfa')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly sessions: SessionRepository,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<MfaStatus> {
    return this.mfaService.getStatus(user);
  }

  @Post('totp/setup')
  @HttpCode(200)
  setup(@CurrentUser() user: AuthUser): Promise<TotpSetup> {
    return this.mfaService.startTotpSetup(user);
  }

  @Post('totp/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: AuthUser,
    @Body({ schema: totpCodeBodySchema }) body: TotpCodeBody,
    @Req() request: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    const recoveryCodes = await this.mfaService.confirmTotpSetup(
      user,
      body.code,
    );
    // Sessions opened with the password alone predate the second factor.
    await this.sessions.revokeAll(user.id, request.sessionID);
    return { recoveryCodes };
  }

  @Post('recovery-codes')
  @HttpCode(200)
  async regenerateRecoveryCodes(
    @CurrentUser() user: AuthUser,
    @Body({ schema: totpCodeBodySchema }) body: TotpCodeBody,
  ): Promise<{ recoveryCodes: string[] }> {
    return {
      recoveryCodes: await this.mfaService.regenerateRecoveryCodes(
        user,
        body.code,
      ),
    };
  }

  @Post('disable')
  @HttpCode(204)
  async disable(
    @CurrentUser() user: AuthUser,
    @Body({ schema: disableMfaSchema }) body: DisableMfaInput,
  ): Promise<void> {
    await this.mfaService.disable(user, body.password, body.code);
  }
}
