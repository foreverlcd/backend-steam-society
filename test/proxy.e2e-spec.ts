import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

// Production runs behind Caddy, which talks plain HTTP to the API and says
// the client used HTTPS in X-Forwarded-Proto. With TRUST_PROXY=1 the secure
// session cookie must still be issued.
describe('behind a reverse proxy (TRUST_PROXY)', () => {
  let app: INestApplication<App>;
  const saved = {
    TRUST_PROXY: process.env.TRUST_PROXY,
    SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
  };

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    process.env.SESSION_COOKIE_SECURE = 'true';
    // ConfigModule reads the environment when AppModule is first imported.
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { MailerService } =
      await import('../src/modules/auth/mailer.service.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useValue({
        sendPasswordReset: async () => undefined,
        sendEmailVerification: async () => undefined,
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function login(forwardedProto?: string) {
    const email = `proxy-${randomUUID()}@example.com`;
    const password = 'test-only-proxy-password';
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, role: 'mentee', birthDate: '2000-01-01', acceptTerms: true })
      .expect(201);
    const req = request(app.getHttpServer()).post('/v1/auth/login');
    if (forwardedProto) req.set('X-Forwarded-Proto', forwardedProto);
    return req.send({ email, password }).expect(200);
  }

  function secureCookie(setCookie: string | string[] | undefined) {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    return cookies.find((value) => value.startsWith('__Host-sid='));
  }

  it('issues the secure session cookie when the proxy reports HTTPS', async () => {
    const response = await login('https');
    const cookie = secureCookie(response.headers['set-cookie']);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; Secure/i);
  });

  it('withholds it on a plain HTTP request', async () => {
    const response = await login();
    expect(secureCookie(response.headers['set-cookie'])).toBeUndefined();
  });
});
