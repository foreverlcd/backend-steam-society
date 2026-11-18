import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailerService } from '../src/modules/auth/mailer.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { currentTotp, enrollTotp } from './helpers/auth.js';

// Fixture values for fictional test accounts only.
const TEST_PASSWORD = 'test-only-correct-horse';
const NEW_TEST_PASSWORD = 'test-only-new-battery-staple';

class FakeMailer {
  readonly emailChanges: Array<{ to: string; token: string }> = [];
  readonly notices: Array<{ kind: string; to: string }> = [];

  async sendEmailVerification(): Promise<void> {}
  async sendPasswordReset(): Promise<void> {}
  async sendEmailChangeVerification(to: string, token: string): Promise<void> {
    this.emailChanges.push({ to, token });
  }
  async sendEmailChangeRequestedNotice(to: string): Promise<void> {
    this.notices.push({ kind: 'change_requested', to });
  }
  async sendEmailChangedNotice(to: string): Promise<void> {
    this.notices.push({ kind: 'changed', to });
  }
  async sendPasswordChangedNotice(to: string): Promise<void> {
    this.notices.push({ kind: 'password_changed', to });
  }
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookie = cookies.find(
    (value) => value?.startsWith('sid=') || value?.startsWith('__Host-sid='),
  );
  if (!cookie) throw new Error('Session cookie was not set');
  return cookie.split(';')[0];
}

describe('Account security (e2e)', () => {
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
      'TRUNCATE TABLE "auth_session", "user" CASCADE',
    );
    mailer.emailChanges.length = 0;
    mailer.notices.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function signUp(): Promise<string> {
    const email = `user-${randomUUID()}@example.com`;
    await http()
      .post('/v1/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'mentee',
        birthDate: '2000-01-01',
        acceptTerms: true,
      })
      .expect(201);
    return email;
  }

  async function login(
    email: string,
    password = TEST_PASSWORD,
    userAgent = 'Firefox test',
  ): Promise<string> {
    const response = await http()
      .post('/v1/auth/login')
      .set('User-Agent', userAgent)
      .send({ email, password })
      .expect(200);
    return sessionCookie(response.headers['set-cookie']);
  }

  describe('sessions', () => {
    it('lists my devices without exposing session ids, and revokes one or all others', async () => {
      const email = await signUp();
      const laptop = await login(email, TEST_PASSWORD, 'Laptop browser');
      const phone = await login(email, TEST_PASSWORD, 'Phone browser');
      const tablet = await login(email, TEST_PASSWORD, 'Tablet browser');

      const list = await http()
        .get('/v1/me/sessions')
        .set('Cookie', laptop)
        .expect(200);
      expect(list.body).toHaveLength(3);
      const current = list.body.find((s: { current: boolean }) => s.current);
      expect(current.userAgent).toBe('Laptop browser');
      expect(current.signedInAt).toEqual(expect.any(String));
      const rawSid = decodeURIComponent(laptop.split('=')[1])
        .slice(2)
        .split('.')[0];
      expect(JSON.stringify(list.body)).not.toContain(rawSid);

      const phoneId = list.body.find(
        (s: { userAgent: string }) => s.userAgent === 'Phone browser',
      ).id;
      await http()
        .delete(`/v1/me/sessions/${phoneId}`)
        .set('Cookie', laptop)
        .expect(204);
      await http().get('/v1/me').set('Cookie', phone).expect(401);
      await http()
        .delete(`/v1/me/sessions/${phoneId}`)
        .set('Cookie', laptop)
        .expect(404);
      await http()
        .delete('/v1/me/sessions/not-an-id')
        .set('Cookie', laptop)
        .expect(400);

      const revoked = await http()
        .post('/v1/me/sessions/revoke-others')
        .set('Cookie', laptop)
        .expect(200);
      expect(revoked.body).toEqual({ revoked: 1 });
      await http().get('/v1/me').set('Cookie', tablet).expect(401);
      await http().get('/v1/me').set('Cookie', laptop).expect(200);
    });

    it('never lets me revoke someone else’s session', async () => {
      const mine = await login(await signUp());
      const theirs = await login(await signUp());
      const [theirSession] = (
        await http().get('/v1/me/sessions').set('Cookie', theirs)
      ).body;

      await http()
        .delete(`/v1/me/sessions/${theirSession.id}`)
        .set('Cookie', mine)
        .expect(404);
      await http().get('/v1/me').set('Cookie', theirs).expect(200);
    });
  });

  describe('password change', () => {
    it('needs the current password, signs out other devices and notifies', async () => {
      const email = await signUp();
      const here = await login(email);
      const elsewhere = await login(email);

      const wrong = await http()
        .post('/v1/me/password')
        .set('Cookie', here)
        .send({
          password: 'test-only-wrong-password',
          newPassword: NEW_TEST_PASSWORD,
        })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

      await http()
        .post('/v1/me/password')
        .set('Cookie', here)
        .send({ password: TEST_PASSWORD, newPassword: NEW_TEST_PASSWORD })
        .expect(204);

      await http().get('/v1/me').set('Cookie', here).expect(200);
      await http().get('/v1/me').set('Cookie', elsewhere).expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ email, password: TEST_PASSWORD })
        .expect(401);
      await login(email, NEW_TEST_PASSWORD);
      expect(mailer.notices).toContainEqual({
        kind: 'password_changed',
        to: email,
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'user.password_changed' },
        }),
      ).toBe(1);
    });

    it('asks for the 2FA code when enabled', async () => {
      const email = await signUp();
      const cookie = await login(email);
      const { secret } = await enrollTotp(app, cookie);

      const missing = await http()
        .post('/v1/me/password')
        .set('Cookie', cookie)
        .send({ password: TEST_PASSWORD, newPassword: NEW_TEST_PASSWORD })
        .expect(400);
      expect(missing.body.code).toBe('MFA_CODE_REQUIRED');

      await http()
        .post('/v1/me/password')
        .set('Cookie', cookie)
        .send({
          password: TEST_PASSWORD,
          newPassword: NEW_TEST_PASSWORD,
          code: currentTotp(secret, 1),
        })
        .expect(204);
    });
  });

  describe('email change', () => {
    it('moves the account only after the new address confirms it', async () => {
      const email = await signUp();
      const cookie = await login(email);
      const newEmail = `new-${randomUUID()}@example.com`;

      await http()
        .post('/v1/me/email')
        .set('Cookie', cookie)
        .send({ password: TEST_PASSWORD, newEmail: newEmail.toUpperCase() })
        .expect(202);
      expect(mailer.emailChanges).toEqual([
        { to: newEmail, token: expect.any(String) },
      ]);
      await vi.waitFor(() =>
        expect(mailer.notices).toContainEqual({
          kind: 'change_requested',
          to: email,
        }),
      );
      expect(
        (await http().get('/v1/me').set('Cookie', cookie)).body.email,
      ).toBe(email);

      await http()
        .post('/v1/auth/email/verify')
        .send({ token: mailer.emailChanges[0].token })
        .expect(204);

      const me = await http().get('/v1/me').set('Cookie', cookie).expect(200);
      expect(me.body).toMatchObject({ email: newEmail, emailVerified: true });
      await vi.waitFor(() =>
        expect(mailer.notices).toContainEqual({ kind: 'changed', to: email }),
      );
      await http()
        .post('/v1/auth/login')
        .send({ email, password: TEST_PASSWORD })
        .expect(401);
      await login(newEmail);
    });

    it('refuses an address taken before confirmation', async () => {
      const email = await signUp();
      const cookie = await login(email);
      const contested = `contested-${randomUUID()}@example.com`;

      await http()
        .post('/v1/me/email')
        .set('Cookie', cookie)
        .send({ password: TEST_PASSWORD, newEmail: contested })
        .expect(202);
      await http()
        .post('/v1/auth/register')
        .send({
          email: contested,
          password: TEST_PASSWORD,
          role: 'mentee',
          birthDate: '2000-01-01',
          acceptTerms: true,
        })
        .expect(201);

      const response = await http()
        .post('/v1/auth/email/verify')
        .send({ token: mailer.emailChanges[0].token })
        .expect(409);
      expect(response.body.code).toBe('EMAIL_TAKEN');
      expect(
        (await http().get('/v1/me').set('Cookie', cookie)).body.email,
      ).toBe(email);
    });

    it('keeps a pending change when the user asks for a new verification link', async () => {
      const email = await signUp();
      const cookie = await login(email);
      await http()
        .post('/v1/me/email')
        .set('Cookie', cookie)
        .send({
          password: TEST_PASSWORD,
          newEmail: `x-${randomUUID()}@example.com`,
        })
        .expect(202);
      await http()
        .post('/v1/auth/email/resend')
        .set('Cookie', cookie)
        .expect(202);

      await http()
        .post('/v1/auth/email/verify')
        .send({ token: mailer.emailChanges[0].token })
        .expect(204);
    });
  });
});
