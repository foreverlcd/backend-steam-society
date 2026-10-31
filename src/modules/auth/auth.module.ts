import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MailerService } from './mailer.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
        getTracker: (request: Record<string, unknown>) => {
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
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    MailerService,
    PasswordHasher,
    UserRepository,
    ThrottlerGuard,
    { provide: CLOCK, useClass: SystemClock },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, MailerService],
})
export class AuthModule {}
