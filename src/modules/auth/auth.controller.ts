import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../shared/http/public.decorator.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(
    @Body({ schema: registerSchema }) body: RegisterInput,
  ): Promise<AuthUser> {
    return this.authService.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() request: Request,
  ): Promise<AuthUser> {
    const user = await this.authService.login(body.email, body.password);
    await this.authService.startSession(request, user.id);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request);
    response.clearCookie(this.authService.getSessionCookieName(), {
      path: '/',
      httpOnly: true,
      secure: this.authService.isSecureSessionCookie(),
      sameSite: 'lax',
    });
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(
    @Body({ schema: forgotPasswordSchema }) body: ForgotPasswordInput,
  ): { status: string } {
    // Do not reveal whether the email exists, and do not block the response
    // on the email provider.
    void this.authService.requestPasswordReset(body.email).catch((error) => {
      this.logger.error(
        `Password reset request failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    });
    return { status: 'accepted' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ): Promise<void> {
    await this.authService.resetPassword(body.token, body.password);
  }
}

@Controller('me')
export class MeController {
  @Get()
  getMe(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
