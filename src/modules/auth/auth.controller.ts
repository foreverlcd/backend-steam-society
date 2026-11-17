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
import { AllowWithoutMfa } from '../../shared/http/account-policy.decorators.js';
import { Public } from '../../shared/http/public.decorator.js';
import {
  forgotPasswordSchema,
  loginMfaSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type LoginMfaInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { invalidMfaCode, MfaService } from './mfa.service.js';

/** Login answer when the account has a second factor. */
export interface MfaChallenge {
  mfaRequired: true;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

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
  ): Promise<AuthUser | MfaChallenge> {
    const user = await this.authService.login(body.email, body.password);
    if (user.mfaEnabled) {
      await this.authService.startMfaChallenge(request, user.id);
      return { mfaRequired: true };
    }
    await this.authService.startSession(request, user.id);
    return user;
  }

  /** Second step of the login when the account has 2FA (ADR-024). */
  @Public()
  @Post('login/mfa')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async loginMfa(
    @Body({ schema: loginMfaSchema }) body: LoginMfaInput,
    @Req() request: Request,
  ): Promise<AuthUser> {
    const userId = this.authService.pendingMfaUserId(request);
    if (!(await this.mfaService.verifySecondFactor(userId, body))) {
      throw invalidMfaCode();
    }
    const user = await this.authService.findActiveUser(userId);
    await this.authService.startSession(request, user.id);
    return user;
  }

  @Public()
  @Post('email/verify')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(
    @Body({ schema: verifyEmailSchema }) body: VerifyEmailInput,
  ): Promise<void> {
    await this.authService.verifyEmail(body.token);
  }

  @AllowWithoutMfa()
  @Post('email/resend')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendEmailVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<{ status: string }> {
    await this.authService.resendEmailVerification(user);
    return { status: 'accepted' };
  }

  @AllowWithoutMfa()
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
  @AllowWithoutMfa()
  @Get()
  getMe(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
