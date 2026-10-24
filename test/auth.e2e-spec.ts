import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailerService } from '../src/modules/auth/mailer.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';

class FakeMailer {
  readonly sent: Array<{ to: string; token: string }> = [];

  async sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ to, token });
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
      })
      .expect(400);
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
});
