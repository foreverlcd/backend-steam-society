import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AccountPolicyGuard } from './account-policy.guard.js';
import { AccountSecurityController } from './account-security.controller.js';
import { AccountSecurityService } from './account-security.service.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MailerService } from './mailer.service.js';
import { MfaController } from './mfa.controller.js';
import { MfaRepository } from './mfa.repository.js';
import { MfaService } from './mfa.service.js';
import { PasswordBreachChecker } from './password-breach-checker.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RolesGuard } from './roles.guard.js';
import { SecretBox } from './secret-box.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionRepository } from './session.repository.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
        // Load tests from one machine would only measure the limiter. Env
        // validation refuses THROTTLE_DISABLED=true in production.
        skipIf: () => process.env.THROTTLE_DISABLED === 'true',
        getTracker: (request: Record<string, unknown>) => {
          // Signed-in requests are limited per account, so people sharing an
          // IP (a school, a NAT) do not exhaust each other's quota.
          const session = request.session as
            { userId?: unknown; pendingMfa?: { userId?: unknown } } | undefined;
          if (typeof session?.userId === 'string') {
            return `user:${session.userId}`;
          }
          // Second-factor guesses are limited per account, whatever the IP.
          if (typeof session?.pendingMfa?.userId === 'string') {
            return `mfa:${session.pendingMfa.userId}`;
          }

          const email =
            typeof request.body === 'object' &&
            request.body !== null &&
            'email' in request.body &&
            typeof request.body.email === 'string'
              ? request.body.email.trim().toLowerCase().slice(0, 254)
              : 'anonymous';
          const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
          return `${ip}:${email}`;
        },
      },
    ]),
  ],
  controllers: [
    AuthController,
    MeController,
    MfaController,
    AccountSecurityController,
  ],
  providers: [
    AuthService,
    AccountSecurityService,
    MailerService,
    PasswordBreachChecker,
    PasswordHasher,
    SessionRepository,
    UserRepository,
    MfaRepository,
    MfaService,
    SecretBox,
    ThrottlerGuard,
    { provide: CLOCK, useClass: SystemClock },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Order matters: runs after the session and role checks (ADR-024).
    { provide: APP_GUARD, useClass: AccountPolicyGuard },
  ],
  exports: [AuthService, MailerService],
})
export class AuthModule {}
