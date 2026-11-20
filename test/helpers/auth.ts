import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { totpCodeForStep, totpTimeStep } from '../../src/modules/auth/totp.js';

/** Tests that do not exercise verification start from a verified e-mail. */
export async function markEmailVerified(
  prisma: PrismaService,
  email: string,
): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
}

/**
 * Enrolls a TOTP factor through the real API (admins need it, ADR-024).
 * Setup asks for the password again, like the web does.
 * Returns the base32 secret and the recovery codes.
 */
export async function enrollTotp(
  app: INestApplication,
  cookie: string,
  password: string,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await request(app.getHttpServer())
    .post('/v1/me/mfa/totp/setup')
    .set('Cookie', cookie)
    .send({ password })
    .expect(200);
  const secret: string = setup.body.secret;
  const confirm = await request(app.getHttpServer())
    .post('/v1/me/mfa/totp/confirm')
    .set('Cookie', cookie)
    .send({ code: currentTotp(secret) })
    .expect(200);
  return { secret, recoveryCodes: confirm.body.recoveryCodes };
}

export function currentTotp(secret: string, offsetSteps = 0): string {
  return totpCodeForStep(secret, totpTimeStep(new Date()) + offsetSteps);
}
