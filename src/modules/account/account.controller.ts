import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  deleteAccountSchema,
  type DeleteAccountInput,
} from './account.schemas.js';
import { AccountService, type AccountExport } from './account.service.js';

@Controller('me')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 3, ttl: 60_000 } })
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly authService: AuthService,
  ) {}

  /** Everything we store about you, as a JSON download. */
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async exportData(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountExport> {
    const data = await this.account.exportData(user);
    const day = data.exportedAt.toISOString().slice(0, 10);
    response.attachment(`steam-society-mis-datos-${day}.json`);
    return data;
  }

  /** Deletes (anonymises) the account and signs out everywhere. */
  @Post('delete')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.account.deleteAccount(user, {
      password: body.password,
      code: body.code,
    });
    response.clearCookie(this.authService.getSessionCookieName(), {
      path: '/',
      httpOnly: true,
      secure: this.authService.isSecureSessionCookie(),
      sameSite: 'lax',
    });
  }
}
