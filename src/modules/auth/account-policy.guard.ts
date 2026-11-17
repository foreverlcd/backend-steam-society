import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ALLOWED_WITHOUT_MFA_KEY,
  REQUIRES_VERIFIED_EMAIL_KEY,
} from '../../shared/http/account-policy.decorators.js';
import { MfaService } from './mfa.service.js';

/**
 * Runs after SessionAuthGuard (ADR-024):
 * - a role that requires 2FA (admin) without an enrolled factor can only use
 *   routes marked @AllowWithoutMfa;
 * - routes marked @RequireVerifiedEmail need a confirmed e-mail.
 */
@Injectable()
export class AccountPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly mfaService: MfaService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) return true; // public route; SessionAuthGuard already decided

    const targets = [context.getHandler(), context.getClass()];

    if (
      this.mfaService.isRequiredFor(user.role) &&
      !user.mfaEnabled &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOWED_WITHOUT_MFA_KEY,
        targets,
      )
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MFA_ENROLLMENT_REQUIRED',
        message: 'Set up two-factor authentication to continue',
      });
    }

    if (
      !user.emailVerified &&
      this.reflector.getAllAndOverride<boolean>(
        REQUIRES_VERIFIED_EMAIL_KEY,
        targets,
      )
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirm your email to continue',
      });
    }

    return true;
  }
}
