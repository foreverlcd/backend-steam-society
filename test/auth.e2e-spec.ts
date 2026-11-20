import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { LEGAL_TERMS_VERSION } from '../src/modules/auth/legal-terms.js';
import { MailerService } from '../src/modules/auth/mailer.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { currentTotp, enrollTotp } from './helpers/auth.js';

class FakeMailer {
  readonly sent: Array<{ to: string; token: string }> = [];
  readonly verifications: Array<{ to: string; token: string }> = [];

  async sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ to, token });
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.push({ to, token });
  }

  readonly mfaNotices: string[] = [];
  readonly guardianRequests: Array<{ to: string; token: string }> = [];

  async sendGuardianConsentRequest(
    to: string,
    _childFirstName: string | null,
    token: string,
  ): Promise<void> {
    this.guardianRequests.push({ to, token });
  }

  async sendMfaEnabledNotice(to: string): Promise<void> {
    this.mfaNotices.push(to);
  }
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookie = cookies.find(
    (value) => value?.startsWith('__Host-sid=') || value?.startsWith('sid='),
  );

  if (!cookie) {
    throw new Error('Session cookie was not set');
  }

  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: FakeMailer;

  beforeAll(async () => {
    mailer = new FakeMailer();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "password_reset_token", "auth_session", "user" CASCADE',
    );
    mailer.sent.length = 0;
    mailer.verifications.length = 0;
    mailer.guardianRequests.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(
    overrides: Record<string, unknown> = {},
  ): Promise<{ email: string; password: string }> {
    const email = `user-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery';

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password,
        role: 'mentee',
        birthDate: '2000-01-01',
        acceptTerms: true,
        ...overrides,
      })
      .expect(201);

    return { email, password };
  }

  it('keeps /health public and outside the v1 prefix', async () => {
    const health = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(health.body).toEqual({ status: 'ok', db: 'up' });
    await request(app.getHttpServer()).get('/v1/health').expect(404);
  });

  it('requires a session for protected routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .expect(401);

    expect(response.body.code).toBe('AUTH_REQUIRED');
  });

  it('registers a normalized email and never returns the password hash', async () => {
    const rawEmail = `Mixed-${randomUUID()}@Example.COM`;
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: rawEmail,
        password: 'correct-horse-battery',
        role: 'mentor',
        birthDate: '1995-05-20',
        acceptTerms: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
      .expect(201);

    expect(response.body.email).toBe(rawEmail.toLowerCase());
    expect(response.body.role).toBe('mentor');
    expect(response.body).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUnique({
      where: { email: rawEmail.toLowerCase() },
    });

    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.birthDate?.toISOString()).toBe('1995-05-20T00:00:00.000Z');
  });

  it('rejects duplicate emails regardless of case', async () => {
    const { email, password } = await registerUser();

    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: email.toUpperCase(),
        password,
        role: 'mentee',
        birthDate: '2000-01-01',
        acceptTerms: true,
      })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_TAKEN');
  });

  it('never allows public admin registration', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: `admin-${randomUUID()}@example.com`,
        password: 'correct-horse-battery',
        role: 'admin',
        birthDate: '1990-01-01',
        acceptTerms: true,
      })
      .expect(400);
  });

  describe('legal consent at registration', () => {
    // Ten years ago today: always under 14 on the server clock.
    function childBirthDate(): string {
      const now = new Date();
      now.setUTCFullYear(now.getUTCFullYear() - 10);
      return now.toISOString().slice(0, 10);
    }

    it('rejects a sign-up without accepting the terms', async () => {
      const base = {
        email: `user-${randomUUID()}@example.com`,
        password: 'test-only-correct-horse',
        role: 'mentee',
        birthDate: '2000-01-01',
      };
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(base)
        .expect(400);
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...base, acceptTerms: false })
        .expect(400);
      expect(await prisma.user.count({ where: { email: base.email } })).toBe(0);
    });

    it('requires guardian consent under 14', async () => {
      const email = `kid-${randomUUID()}@example.com`;
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          password: 'test-only-correct-horse',
          role: 'mentee',
          birthDate: childBirthDate(),
          acceptTerms: true,
        })
        .expect(400);

      expect(response.body.code).toBe('GUARDIAN_CONSENT_REQUIRED');
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('asks the guardian to confirm and blocks booking until then', async () => {
      const email = `kid-${randomUUID()}@example.com`;
      const guardianEmail = `parent-${randomUUID()}@example.com`;
      const password = 'test-only-correct-horse';
      const registered = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          password,
          role: 'mentee',
          birthDate: childBirthDate(),
          acceptTerms: true,
          guardianConsent: true,
          guardianEmail,
        })
        .expect(201);
      expect(registered.body.guardianConsentPending).toBe(true);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.guardianEmail).toBe(guardianEmail);
      expect(stored.guardianConsentAt).toBeNull();
      expect(stored.termsVersion).toBe(LEGAL_TERMS_VERSION);
      await vi.waitFor(() => expect(mailer.guardianRequests).toHaveLength(1));
      expect(mailer.guardianRequests[0].to).toBe(guardianEmail);

      // Email verified, consent still pending: booking is refused.
      await prisma.user.update({
        where: { email },
        data: { emailVerifiedAt: new Date() },
      });
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const cookie = sessionCookie(login.headers['set-cookie']);
      const blocked = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Cookie', cookie)
        .send({})
        .expect(403);
      expect(blocked.body.code).toBe('GUARDIAN_CONSENT_PENDING');

      // A corrected address gets a new link; the old one stops working.
      const corrected = `parent2-${randomUUID()}@example.com`;
      await request(app.getHttpServer())
        .post('/v1/me/guardian-consent/resend')
        .set('Cookie', cookie)
        .send({ guardianEmail: corrected })
        .expect(202);
      expect(mailer.guardianRequests.at(-1)?.to).toBe(corrected);
      const oldToken = mailer.guardianRequests[0].token;
      const newToken = mailer.guardianRequests.at(-1)!.token;
      await request(app.getHttpServer())
        .post('/v1/auth/guardian-consent/confirm')
        .send({ token: oldToken })
        .expect(400);

      await request(app.getHttpServer())
        .post('/v1/auth/guardian-consent/confirm')
        .send({ token: newToken })
        .expect(204);
      const reused = await request(app.getHttpServer())
        .post('/v1/auth/guardian-consent/confirm')
        .send({ token: newToken })
        .expect(400);
      expect(reused.body.code).toBe('INVALID_GUARDIAN_TOKEN');

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.guardianEmail).toBe(corrected);
      expect(after.guardianConsentAt).toBeInstanceOf(Date);
      const me = await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.guardianConsentPending).toBe(false);
      // Past the guard now: the empty body fails validation instead.
      await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Cookie', cookie)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post('/v1/me/guardian-consent/resend')
        .set('Cookie', cookie)
        .send({})
        .expect(409);

      const exported = await request(app.getHttpServer())
        .get('/v1/me/export')
        .set('Cookie', cookie)
        .expect(200);
      expect(JSON.stringify(exported.body)).toContain(corrected);

      await request(app.getHttpServer())
        .post('/v1/me/delete')
        .set('Cookie', cookie)
        .send({ password, confirmation: 'ELIMINAR' })
        .expect(204);
      const erased = await prisma.user.findUniqueOrThrow({
        where: { id: after.id },
      });
      expect(erased.guardianEmail).toBeNull();
      expect(
        await prisma.guardianConsentToken.count({
          where: { userId: after.id },
        }),
      ).toBe(0);
      // A link that outlives the account never records consent.
      const lateToken = 'test-only-late-link';
      await prisma.guardianConsentToken.create({
        data: {
          userId: after.id,
          tokenHash: createHash('sha256').update(lateToken).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await prisma.user.update({
        where: { id: after.id },
        data: { guardianConsentAt: null, guardianEmail: 'x@example.com' },
      });
      await request(app.getHttpServer())
        .post('/v1/auth/guardian-consent/confirm')
        .send({ token: lateToken })
        .expect(400);
      const late = await prisma.guardianConsentToken.findFirstOrThrow({
        where: { userId: after.id },
      });
      expect(late.usedAt).toBeNull();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: after.id } }))
          .guardianConsentAt,
      ).toBeNull();
    });

    it('rejects an under-14 sign-up without a guardian e-mail', async () => {
      const email = `kid-${randomUUID()}@example.com`;
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          password: 'test-only-correct-horse',
          role: 'mentee',
          birthDate: childBirthDate(),
          acceptTerms: true,
          guardianConsent: true,
        })
        .expect(400);

      expect(response.body.code).toBe('GUARDIAN_EMAIL_REQUIRED');
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('stores the accepted terms version for an adult', async () => {
      const { email } = await registerUser();

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.termsVersion).toBe(LEGAL_TERMS_VERSION);
      expect(stored.termsAcceptedAt).toBeInstanceOf(Date);
      expect(stored.guardianConsentAt).toBeNull();
    });
  });

  it('logs in, returns the current user and logs out', async () => {
    const { email, password } = await registerUser();

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(login.body.email).toBe(email);
    expect(login.body).not.toHaveProperty('passwordHash');
    const rawCookies = login.headers['set-cookie'] as unknown as
      string[] | undefined;
    const rawCookie = rawCookies?.find(
      (value) => value.startsWith('sid=') || value.startsWith('__Host-sid='),
    );
    expect(rawCookie).toContain('HttpOnly');
    expect(rawCookie).toContain('SameSite=Lax');
    expect(rawCookie).toContain('Path=/');
    const cookie = sessionCookie(login.headers['set-cookie']);

    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('returns the same error for unknown email and wrong password', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: `unknown-${randomUUID()}@example.com`,
        password: 'wrong-password',
      })
      .expect(401);

    const { email } = await registerUser();
    const wrong = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not allow a suspended user to log in', async () => {
    const { email, password } = await registerUser();
    await prisma.user.update({
      where: { email },
      data: { status: 'suspended' },
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(401);

    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('resets the password once, revokes sessions and rejects token reuse', async () => {
    const { email, password } = await registerUser();

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const oldCookie = sessionCookie(login.headers['set-cookie']);

    const forgot = await request(app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email })
      .expect(202);
    expect(forgot.body).toEqual({ status: 'accepted' });

    await vi.waitFor(() => {
      expect(mailer.sent).toHaveLength(1);
    });

    const { token } = mailer.sent[0];
    const newPassword = 'new-correct-horse-battery';

    await request(app.getHttpServer())
      .post('/v1/auth/password/reset')
      .send({ token, password: newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/password/reset')
      .send({ token, password: 'another-correct-password' })
      .expect(400);

    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Cookie', oldCookie)
      .expect(401);
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email: `nobody-${randomUUID()}@example.com` })
      .expect(202);

    expect(response.body).toEqual({ status: 'accepted' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent).toHaveLength(0);
  });

  it('rate limits repeated login attempts for the same IP and email', async () => {
    const email = `rate-${randomUUID()}@example.com`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(429);
  });

  it('does not give a fresh login quota to each session cookie', async () => {
    // Attacker signs in to throwaway accounts and rotates their cookies
    // against one victim: the limit must still be per IP + victim e-mail.
    const cookies: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const own = await registerUser();
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(own)
        .expect(200);
      cookies.push(sessionCookie(login.headers['set-cookie']));
    }

    const victim = `victim-${randomUUID()}@example.com`;
    const statuses: number[] = [];
    for (const cookie of cookies) {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('Cookie', cookie)
        .send({ email: victim, password: 'test-only-wrong' });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('rejects cross-origin state changes and accepts trusted origins', async () => {
    const email = `csrf-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ email, password: 'wrong-password' })
      .expect(403);

    const trusted = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ email, password: 'wrong-password' });

    expect(trusted.status).toBe(401);
  });

  it('exposes CORS with credentials for configured web origins', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  async function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
  }

  describe('email verification (ADR-024)', () => {
    it('starts unverified, blocks gated actions and verifies once with the emailed link', async () => {
      const { email, password } = await registerUser({ role: 'mentor' });
      await vi.waitFor(() => expect(mailer.verifications).toHaveLength(1));
      const cookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );

      const me = await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.emailVerified).toBe(false);

      const blocked = await request(app.getHttpServer())
        .post('/v1/me/profile/submit')
        .set('Cookie', cookie)
        .expect(403);
      expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

      const { token } = mailer.verifications[0];
      const stored = await prisma.emailVerificationToken.findFirstOrThrow();
      expect(stored.tokenHash).not.toBe(token);

      await request(app.getHttpServer())
        .post('/v1/auth/email/verify')
        .send({ token })
        .expect(204);
      const reused = await request(app.getHttpServer())
        .post('/v1/auth/email/verify')
        .send({ token })
        .expect(400);
      expect(reused.body.code).toBe('INVALID_VERIFICATION_TOKEN');

      const after = await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(after.body.emailVerified).toBe(true);
      const resend = await request(app.getHttpServer())
        .post('/v1/auth/email/resend')
        .set('Cookie', cookie)
        .expect(409);
      expect(resend.body.code).toBe('EMAIL_ALREADY_VERIFIED');
    });

    it('keeps only one valid link when resends race', async () => {
      const { email, password } = await registerUser();
      await vi.waitFor(() => expect(mailer.verifications).toHaveLength(1));
      const cookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );

      await Promise.all(
        [1, 2, 3].map(() =>
          request(app.getHttpServer())
            .post('/v1/auth/email/resend')
            .set('Cookie', cookie),
        ),
      );
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(
        await prisma.emailVerificationToken.count({
          where: { userId: user.id, usedAt: null },
        }),
      ).toBe(1);
    });

    it('resends a new link and invalidates the previous one', async () => {
      const { email, password } = await registerUser();
      await vi.waitFor(() => expect(mailer.verifications).toHaveLength(1));
      const cookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );

      await request(app.getHttpServer())
        .post('/v1/auth/email/resend')
        .set('Cookie', cookie)
        .expect(202);
      expect(mailer.verifications).toHaveLength(2);

      await request(app.getHttpServer())
        .post('/v1/auth/email/verify')
        .send({ token: mailer.verifications[0].token })
        .expect(400);
      await request(app.getHttpServer())
        .post('/v1/auth/email/verify')
        .send({ token: mailer.verifications[1].token })
        .expect(204);
    });
  });

  describe('two-factor authentication (ADR-024)', () => {
    it('asks for the second factor after the password and rejects replays', async () => {
      const { email, password } = await registerUser();
      const firstCookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );
      const { secret } = await enrollTotp(app, firstCookie, password);

      const challenge = await login(email, password);
      expect(challenge.body).toEqual({ mfaRequired: true });
      const cookie = sessionCookie(challenge.headers['set-cookie']);
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', cookie)
        .expect(401);

      const wrong = await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .set('Cookie', cookie)
        .send({ code: '000000' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_MFA_CODE');

      // The enrollment used the current step; the next one is still accepted (drift).
      const code = currentTotp(secret, 1);
      const ok = await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .set('Cookie', cookie)
        .send({ code })
        .expect(200);
      expect(ok.body).toMatchObject({ email, mfaEnabled: true });
      const signedIn = sessionCookie(ok.headers['set-cookie']);
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', signedIn)
        .expect(200);

      const again = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );
      await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .set('Cookie', again)
        .send({ code })
        .expect(401);
    });

    it('signs in with a recovery code exactly once', async () => {
      const { email, password } = await registerUser();
      const cookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );
      const { recoveryCodes } = await enrollTotp(app, cookie, password);

      const first = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );
      await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .set('Cookie', first)
        .send({ recoveryCode: recoveryCodes[0] })
        .expect(200);

      const second = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );
      await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .set('Cookie', second)
        .send({ recoveryCode: recoveryCodes[0] })
        .expect(401);
    });

    it('requires the second factor without a pending password step', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login/mfa')
        .send({ code: '123456' })
        .expect(401);
      expect(response.body.code).toBe('MFA_CHALLENGE_EXPIRED');
    });

    it('makes admins enroll before using admin routes and never lets them turn it off', async () => {
      const { email, password } = await registerUser();
      await prisma.user.update({ where: { email }, data: { role: 'admin' } });
      const cookie = sessionCookie(
        (await login(email, password)).headers['set-cookie'],
      );

      const blocked = await request(app.getHttpServer())
        .get('/v1/admin/mentors')
        .set('Cookie', cookie)
        .expect(403);
      expect(blocked.body.code).toBe('MFA_ENROLLMENT_REQUIRED');
      const status = await request(app.getHttpServer())
        .get('/v1/me/mfa')
        .set('Cookie', cookie)
        .expect(200);
      expect(status.body).toEqual({
        enabled: false,
        required: true,
        recoveryCodesRemaining: 0,
      });

      // Setup asks for the password again: a stolen session is not enough.
      await request(app.getHttpServer())
        .post('/v1/me/mfa/totp/setup')
        .set('Cookie', cookie)
        .expect(400);
      const wrong = await request(app.getHttpServer())
        .post('/v1/me/mfa/totp/setup')
        .set('Cookie', cookie)
        .send({ password: 'test-only-not-the-password' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

      const { secret } = await enrollTotp(app, cookie, password);
      expect(mailer.mfaNotices).toContain(email);
      await request(app.getHttpServer())
        .get('/v1/admin/mentors')
        .set('Cookie', cookie)
        .expect(200);

      const disable = await request(app.getHttpServer())
        .post('/v1/me/mfa/disable')
        .set('Cookie', cookie)
        .send({ password, code: currentTotp(secret, 1) })
        .expect(403);
      expect(disable.body.code).toBe('MFA_REQUIRED_FOR_ROLE');
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.mfa_enabled' },
      });
      expect(audit.entityType).toBe('user');
    });
  });
});
