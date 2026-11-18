import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CLOCK, type Clock } from '../src/shared/clock/clock.js';
import {
  EmailDispatcher,
  MAX_ATTEMPTS,
} from '../src/shared/mail/email-dispatcher.js';
import { EmailOutbox } from '../src/shared/mail/email-outbox.service.js';
import {
  EMAIL_TRANSPORT,
  type EmailTransport,
  type OutgoingEmail,
} from '../src/shared/mail/email-transport.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';

class FakeClock implements Clock {
  current = new Date();
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class FakeTransport implements EmailTransport {
  configured = true;
  delivered: OutgoingEmail[] = [];
  /** Errors thrown by the next deliveries, in order. */
  failures: unknown[] = [];

  async deliver(email: OutgoingEmail): Promise<void> {
    // Yield so concurrent dispatchers really interleave.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.delivered.push(email);
  }
}

const smtpError = (responseCode: number) =>
  Object.assign(new Error('rejected'), { responseCode });
const networkError = () =>
  Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });

describe('E-mail outbox (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let outbox: EmailOutbox;
  let dispatcher: EmailDispatcher;
  let clock: FakeClock;
  let transport: FakeTransport;

  beforeAll(async () => {
    clock = new FakeClock();
    transport = new FakeTransport();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(transport)
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(EmailOutbox);
    dispatcher = app.get(EmailDispatcher);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "email_outbox", "password_reset_token", "auth_session", "user" CASCADE',
    );
    clock.current = new Date();
    transport.configured = true;
    transport.delivered = [];
    transport.failures = [];
  });

  afterAll(async () => {
    await app.close();
  });

  function queue(overrides: { expiresAt?: Date } = {}) {
    return outbox.enqueue({
      kind: 'test.kind',
      to: 'ana@example.com',
      subject: 'Hola',
      text: 'enlace secreto',
      ...overrides,
    });
  }

  async function onlyRow() {
    const rows = await prisma.emailOutbox.findMany();
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it('sends a queued e-mail and wipes its body', async () => {
    await queue();

    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ sent: 1 });

    const row = await onlyRow();
    expect(transport.delivered).toEqual([
      {
        to: 'ana@example.com',
        subject: 'Hola',
        text: 'enlace secreto',
        // Stable: a resend after a crash carries the same Message-ID.
        messageId: `<${row.id}@outbox.steam-society>`,
      },
    ]);
    expect(row).toMatchObject({
      status: 'sent',
      body: null,
      attempts: 1,
      lockedUntil: null,
    });
  });

  it('retries a transient failure later, keeping the body until then', async () => {
    await queue();
    transport.failures.push(networkError());

    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
      retried: 1,
    });
    expect(await onlyRow()).toMatchObject({
      status: 'pending',
      body: 'enlace secreto',
      lastError: 'ETIMEDOUT',
    });

    // Not yet due: nothing happens.
    clock.advance(30_000);
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ sent: 0 });

    clock.advance(31_000);
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({ sent: 1 });
    expect(await onlyRow()).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('fails at once when the server rejects the message (5xx)', async () => {
    await queue();
    transport.failures.push(smtpError(550));

    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
      failed: 1,
    });
    expect(await onlyRow()).toMatchObject({
      status: 'failed',
      body: null,
      lastError: 'SMTP_550',
    });
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
    await queue();
    transport.failures = Array.from({ length: MAX_ATTEMPTS }, networkError);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await dispatcher.dispatchDue();
      clock.advance(7 * 3_600_000);
    }

    expect(await onlyRow()).toMatchObject({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      body: null,
    });
    expect(transport.delivered).toHaveLength(0);
  });

  it('never sends a link after it expired', async () => {
    await queue({ expiresAt: new Date(clock.current.getTime() + 60_000) });
    transport.configured = false;
    await dispatcher.dispatchDue();
    expect(await onlyRow()).toMatchObject({ status: 'pending' });

    transport.configured = true;
    clock.advance(61_000);
    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
      expired: 1,
      sent: 0,
    });
    expect(await onlyRow()).toMatchObject({ status: 'expired', body: null });
  });

  it('does not retry past the expiry of the link', async () => {
    // Valid 2 more minutes; the next retry would be after 5 (2nd failure).
    await queue({ expiresAt: new Date(clock.current.getTime() + 120_000) });
    transport.failures.push(networkError(), networkError());
    await dispatcher.dispatchDue();
    clock.advance(61_000);

    await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
      failed: 1,
    });
  });

  it('queues an e-mail once per dedupe key', async () => {
    const email = {
      kind: 'test.kind',
      to: 'ana@example.com',
      subject: 'Hola',
      text: 'x',
      dedupeKey: 'test:1',
    };
    await outbox.enqueue(email);
    await outbox.enqueue(email);
    // Also inside a transaction: a duplicate must not abort it.
    await prisma.$transaction(async (tx) => {
      await outbox.enqueue(email, tx);
      await outbox.enqueue({ ...email, dedupeKey: 'test:2' }, tx);
    });

    expect(await prisma.emailOutbox.count()).toBe(2);
  });

  it('expires a link that runs out while the batch is being sent', async () => {
    await queue({ expiresAt: new Date(clock.current.getTime() + 60_000) });
    const deliver = transport.deliver.bind(transport);
    // The clock moves past the expiry between the claim and the send.
    transport.deliver = async (email) => {
      throw new Error(`should not send ${email.subject}`);
    };
    const realDeliver = dispatcher['deliver'].bind(dispatcher);
    dispatcher['deliver'] = (row: never) => {
      clock.advance(61_000);
      return realDeliver(row);
    };
    try {
      await expect(dispatcher.dispatchDue()).resolves.toMatchObject({
        expired: 1,
        sent: 0,
      });
    } finally {
      transport.deliver = deliver;
      dispatcher['deliver'] = realDeliver;
    }
    expect(await onlyRow()).toMatchObject({ status: 'expired', body: null });
  });

  it('delivers each e-mail once with concurrent dispatchers', async () => {
    for (let i = 0; i < 15; i += 1) {
      await outbox.enqueue({
        kind: 'test.kind',
        to: `p${i}@example.com`,
        subject: 'Hola',
        text: 'x',
      });
    }

    for (let round = 0; round < 2; round += 1) {
      await Promise.all([
        dispatcher.dispatchDue(),
        dispatcher.dispatchDue(),
        dispatcher.dispatchDue(),
      ]);
    }

    const recipients = transport.delivered.map((email) => email.to);
    expect(recipients).toHaveLength(15);
    expect(new Set(recipients).size).toBe(15);
  });

  it('queues the password reset link to expire with it', async () => {
    const email = `reset-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password: 'test-only-correct-horse',
        role: 'mentee',
        birthDate: '1998-01-01',
        acceptTerms: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email })
      .expect(202);

    // The request is processed in the background (no account enumeration).
    const reset = await vi.waitFor(() =>
      prisma.emailOutbox.findFirstOrThrow({
        where: { kind: 'auth.password_reset' },
      }),
    );
    expect(reset).toMatchObject({ toAddress: email, status: 'pending' });
    expect(reset.expiresAt!.getTime() - clock.current.getTime()).toBe(
      3_600_000,
    );
    expect(reset.body).toContain('/reset-password?token=');
  });
});
