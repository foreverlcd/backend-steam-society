import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedTaxonomies } from '../prisma/seed-data.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BookingsService } from '../src/modules/bookings/application/bookings.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { enrollTotp, markEmailVerified } from './helpers/auth.js';

interface AuthSession {
  cookie: string;
  email: string;
  password: string;
}

interface UserSession extends AuthSession {
  userId: string;
}

interface OfferingBody {
  id: string;
  mentorId: string;
  title: string;
  durationMinutes: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
}

interface BookingBody {
  id: string;
  status: string;
  paymentRequired: boolean;
  priceMinor: number;
  currency: string;
  expiresAt: string;
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    meetingUrl: string | null;
  };
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

function limaDate(offsetDays: number): string {
  const millis =
    Date.now() + offsetDays * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000;
  return new Date(millis).toISOString().slice(0, 10);
}

function limaInstant(date: string, hour: number): string {
  return `${date}T${String(hour + 5).padStart(2, '0')}:00:00.000Z`;
}

describe('Bookings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let bookings: BookingsService;
  let science: { id: string; name: string; parentId: string | null };
  let biology: { id: string; name: string; parentId: string | null };
  let technology: { id: string; name: string; parentId: string | null };
  let ai: { id: string; name: string; parentId: string | null };
  let targetDate: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    bookings = app.get(BookingsService);
    await seedTaxonomies(prisma);

    const areas = await prisma.area.findMany({
      select: { id: true, name: true, parentId: true },
    });
    science = areas.find((area) => area.name === 'Ciencia')!;
    biology = areas.find((area) => area.name === 'Biología')!;
    technology = areas.find((area) => area.name === 'Tecnología')!;
    ai = areas.find((area) => area.name === 'Inteligencia artificial')!;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "email_outbox", "webhook_event", "payment", "booking", "session", "availability_rule", "offering", "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "password_reset_token", "auth_session", "user" CASCADE',
    );
    targetDate = limaDate(2);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    role: 'mentor' | 'mentee',
  ): Promise<AuthSession> {
    const email = `bookings-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery';

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password,
        role,
        birthDate: '1998-01-01',
      })
      .expect(201);
    await markEmailVerified(prisma, email);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      cookie: sessionCookie(login.headers['set-cookie']),
      email,
      password,
    };
  }

  async function completeMentorOnboarding(cookie: string): Promise<void> {
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: {
          city: 'Lima',
          country: 'PE',
          professionalRole: 'professional',
          experienceRange: '6-9',
          linkedinUrl: 'https://www.linkedin.com/in/test-mentor',
          primaryAreaId: technology.id,
          areaIds: [ai.id],
          supportTypes: ['study_plan', 'portfolio'],
          industries: ['tech_saas'],
          mentoringLevels: ['beginner', 'intermediate'],
          menteeStages: ['university'],
          languageCodes: ['es'],
          availabilityPreferences: ['mornings', 'evenings'],
        },
      })
      .expect(200);
  }

  async function completeMenteeOnboarding(cookie: string): Promise<void> {
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: {
          city: 'Arequipa',
          country: 'PE',
          stage: 'university',
          primaryAreaId: science.id,
          areaIds: [biology.id],
          mainGoal: 'decide_career',
          supportTypes: ['scholarships'],
          industries: ['research'],
          currentLevel: 'beginner',
          languageCodes: ['es'],
          availabilityPreferences: ['afternoons'],
        },
      })
      .expect(200);
  }

  async function createMentor(): Promise<UserSession> {
    const session = await registerAndLogin('mentor');
    await completeMentorOnboarding(session.cookie);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: session.email },
    });

    await prisma.mentorProfile.update({
      where: { userId: user.id },
      data: {
        status: 'approved',
        minNoticeHours: 0,
        maxAdvanceDays: 60,
      },
    });

    return { ...session, userId: user.id };
  }

  async function createMentee(): Promise<UserSession> {
    const session = await registerAndLogin('mentee');
    await completeMenteeOnboarding(session.cookie);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: session.email },
    });

    return { ...session, userId: user.id };
  }

  async function setAvailability(cookie: string): Promise<void> {
    const rules = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      startTime: '00:00',
      endTime: '23:00',
      timezone: 'America/Lima',
      validFrom: targetDate,
      validTo: targetDate,
    }));

    await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', cookie)
      .send({ rules })
      .expect(200);
  }

  async function createOffering(
    cookie: string,
    overrides: Record<string, unknown> = {},
  ): Promise<OfferingBody> {
    const response = await request(app.getHttpServer())
      .post('/v1/me/offerings')
      .set('Cookie', cookie)
      .send({
        title: 'Mentoría',
        durationMinutes: 60,
        isFree: true,
        ...overrides,
      })
      .expect(201);

    return response.body as OfferingBody;
  }

  async function book(
    cookie: string,
    offeringId: string,
    startsAt: string,
  ): Promise<BookingBody> {
    const response = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Cookie', cookie)
      .send({ offeringId, startsAt })
      .expect(201);

    return response.body as BookingBody;
  }

  async function prepareMentorWithOffering(
    overrides: Record<string, unknown> = {},
  ): Promise<{ mentor: UserSession; offering: OfferingBody }> {
    const mentor = await createMentor();
    await setAvailability(mentor.cookie);
    const offering = await createOffering(mentor.cookie, overrides);

    return { mentor, offering };
  }

  it('enforces the session exclusion and booking CHECK constraints', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const startsAt = new Date(limaInstant(targetDate, 9));
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const baseSession = {
      offeringId: offering.id,
      mentorId: mentor.userId,
      startsAt,
      endsAt,
      capacity: 1,
    };

    const session = await prisma.session.create({ data: baseSession });

    await expect(
      prisma.session.create({
        data: {
          ...baseSession,
          startsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          endsAt: new Date(endsAt.getTime() + 30 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();

    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'cancelled' },
    });

    const replacement = await prisma.session.create({
      data: {
        ...baseSession,
        startsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
        endsAt: new Date(endsAt.getTime() + 30 * 60 * 1000),
      },
    });

    const menteeProfile = await prisma.menteeProfile.findUniqueOrThrow({
      where: { userId: mentee.userId },
    });

    await expect(
      prisma.booking.create({
        data: {
          sessionId: replacement.id,
          menteeId: menteeProfile.userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          paymentRequired: false,
          priceMinor: 100,
          currency: 'PEN',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.booking.create({
        data: {
          sessionId: replacement.id,
          menteeId: menteeProfile.userId,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000),
          paymentRequired: false,
          priceMinor: 0,
          currency: 'PEN',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.booking.create({
        data: {
          sessionId: replacement.id,
          menteeId: menteeProfile.userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          paymentRequired: false,
          priceMinor: 0,
          currency: 'PEN',
          status: 'no_show',
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a free booking request and exposes it to both participants', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const startsAt = limaInstant(targetDate, 9);

    const created = await book(mentee.cookie, offering.id, startsAt);

    expect(created).toMatchObject({
      status: 'requested',
      paymentRequired: false,
      priceMinor: 0,
      currency: 'PEN',
    });
    expect(created.session).toMatchObject({
      startsAt,
      status: 'open',
      meetingUrl: null,
    });

    const menteeList = await request(app.getHttpServer())
      .get('/v1/bookings')
      .set('Cookie', mentee.cookie)
      .expect(200);
    expect(menteeList.body.items).toHaveLength(1);
    expect(menteeList.body.items[0].id).toBe(created.id);

    const mentorList = await request(app.getHttpServer())
      .get('/v1/bookings')
      .set('Cookie', mentor.cookie)
      .expect(200);
    expect(mentorList.body.items).toHaveLength(1);
    expect(mentorList.body.items[0].id).toBe(created.id);

    const otherMentee = await createMentee();
    const forbidden = await request(app.getHttpServer())
      .get(`/v1/bookings/${created.id}`)
      .set('Cookie', otherMentee.cookie)
      .expect(403);
    expect(forbidden.body.code).toBe('BOOKING_FORBIDDEN');

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored).toMatchObject({
      status: 'requested',
      paymentRequired: false,
      priceMinor: 0,
    });
  });

  it('requires a completed mentee profile before booking', async () => {
    const { offering } = await prepareMentorWithOffering();
    const mentee = await registerAndLogin('mentee');

    const response = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Cookie', mentee.cookie)
      .send({
        offeringId: offering.id,
        startsAt: limaInstant(targetDate, 9),
      })
      .expect(400);

    expect(response.body.code).toBe('MENTEE_PROFILE_REQUIRED');
  });

  it('accepts a free request with an optional https backup link', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    // The session runs in the in-app call; a backup link must be https.
    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'http://meet.example.com/session' })
      .expect(400);

    const accepted = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'https://meet.example.com/session' })
      .expect(200);

    expect(accepted.body).toMatchObject({
      status: 'confirmed',
      session: {
        status: 'open',
        meetingUrl: 'https://meet.example.com/session',
      },
    });
    expect(accepted.body.confirmedAt).toEqual(expect.any(String));
  });

  it('moves a paid request to awaiting_payment', async () => {
    const { mentor, offering } = await prepareMentorWithOffering({
      isFree: false,
      priceMinor: 5000,
      currency: 'PEN',
    });
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    expect(booking).toMatchObject({
      paymentRequired: true,
      priceMinor: 5000,
      currency: 'PEN',
    });

    const accepted = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({})
      .expect(200);

    expect(accepted.body).toMatchObject({
      status: 'awaiting_payment',
      paymentRequired: true,
    });
  });

  it('lets only one concurrent request win the same slot', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const firstMentee = await createMentee();
    const secondMentee = await createMentee();
    const startsAt = limaInstant(targetDate, 9);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Cookie', firstMentee.cookie)
        .send({ offeringId: offering.id, startsAt }),
      request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Cookie', secondMentee.cookie)
        .send({ offeringId: offering.id, startsAt }),
    ]);

    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);

    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.code).toBe('BOOKING_SLOT_TAKEN');

    const count = await prisma.booking.count({
      where: { session: { mentorId: mentor.userId } },
    });
    expect(count).toBe(1);
  });

  it('prevents a mentee from overlapping two active bookings', async () => {
    const first = await prepareMentorWithOffering();
    const second = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const startsAt = limaInstant(targetDate, 9);

    await book(mentee.cookie, first.offering.id, startsAt);

    const response = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Cookie', mentee.cookie)
      .send({ offeringId: second.offering.id, startsAt })
      .expect(409);

    expect(response.body.code).toBe('BOOKING_MENTEE_OVERLAP');
  });

  it('expires a request when read after the deadline and stays idempotent', async () => {
    const { offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );
    const past = new Date(Date.now() - 60_000);
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await prisma.booking.update({
      where: { id: booking.id },
      data: { requestedAt: earlier, expiresAt: past },
    });

    const read = await request(app.getHttpServer())
      .get(`/v1/bookings/${booking.id}`)
      .set('Cookie', mentee.cookie)
      .expect(200);
    expect(read.body.status).toBe('expired');

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: booking.session.id },
    });
    expect(session.status).toBe('cancelled');

    await expect(bookings.expireDue()).resolves.toBe(0);

    const again = await request(app.getHttpServer())
      .get(`/v1/bookings/${booking.id}`)
      .set('Cookie', mentee.cookie)
      .expect(200);
    expect(again.body.status).toBe('expired');
  });

  it('cancels a confirmed booking and frees the session', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'https://meet.example.com/session' })
      .expect(200);

    const cancelled = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/cancel`)
      .set('Cookie', mentee.cookie)
      .send({ reason: 'Surgió un imprevisto' })
      .expect(200);

    expect(cancelled.body).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'mentee',
      cancelReason: 'Surgió un imprevisto',
    });

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: booking.session.id },
    });
    expect(session.status).toBe('cancelled');
  });

  it('rejects cancelling a free confirmed booking after it starts', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'https://meet.example.com/session' })
      .expect(200);

    await prisma.session.update({
      where: { id: booking.session.id },
      data: {
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/cancel`)
      .set('Cookie', mentee.cookie)
      .send({})
      .expect(409);

    expect(response.body.code).toBe('INVALID_BOOKING_TRANSITION');
  });

  it('completes a confirmed session after it ends', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'https://meet.example.com/session' })
      .expect(200);

    await prisma.session.update({
      where: { id: booking.session.id },
      data: {
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const completed = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/complete`)
      .set('Cookie', mentor.cookie)
      .expect(200);

    expect(completed.body.status).toBe('completed');
    expect(completed.body.completedAt).toEqual(expect.any(String));

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: booking.session.id },
    });
    expect(session.status).toBe('completed');
  });

  it('registers a no-show after the session starts', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({ meetingUrl: 'https://meet.example.com/session' })
      .expect(200);

    await prisma.session.update({
      where: { id: booking.session.id },
      data: {
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const noShow = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/no-show`)
      .set('Cookie', mentee.cookie)
      .expect(200);

    // The mentee reports that the mentor did not show up.
    expect(noShow.body).toMatchObject({
      status: 'no_show',
      noShowParty: 'mentor',
    });
  });

  it('rejects non-https meeting URLs', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    for (const meetingUrl of [
      'javascript:alert(1)',
      'http://meet.example.com/a',
      'data:text/html,hi',
    ]) {
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/accept`)
        .set('Cookie', mentor.cookie)
        .send({ meetingUrl })
        .expect(400);
    }
  });

  it('never lets a request expire after its session starts', async () => {
    const { offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const startsAt = limaInstant(targetDate, 9);
    const booking = await book(mentee.cookie, offering.id, startsAt);

    expect(new Date(booking.expiresAt).getTime()).toBeLessThanOrEqual(
      new Date(startsAt).getTime(),
    );
  });

  describe('payments (fake provider)', () => {
    async function awaitingPayment(): Promise<{
      mentor: UserSession;
      mentee: UserSession;
      booking: BookingBody;
    }> {
      const { mentor, offering } = await prepareMentorWithOffering({
        isFree: false,
        priceMinor: 5000,
        currency: 'PEN',
      });
      const mentee = await createMentee();
      const booking = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );

      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/accept`)
        .set('Cookie', mentor.cookie)
        .send({ meetingUrl: 'https://meet.example.com/paid' })
        .expect(200);

      return { mentor, mentee, booking };
    }

    async function webhook(body: Record<string, unknown>, status = 200) {
      return request(app.getHttpServer())
        .post('/v1/payments/webhooks/fake')
        .send(body)
        .expect(status);
    }

    it('exposes whether payments are enabled', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/payments/config')
        .expect(200);

      expect(response.body).toEqual({ enabled: true, provider: 'fake' });
    });

    it('charges, confirms the booking and ignores duplicate webhooks', async () => {
      const { mentee, booking } = await awaitingPayment();

      const checkout = await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(200);

      expect(checkout.body).toMatchObject({
        bookingId: booking.id,
        status: 'pending',
        provider: 'fake',
        amountMinor: 5000,
        currency: 'PEN',
      });
      expect(checkout.body.checkoutUrl).toContain('/payments/fake-checkout');

      // A double click reuses the same open checkout.
      const again = await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(200);
      expect(again.body.checkoutUrl).toBe(checkout.body.checkoutUrl);

      const ref = new URL(checkout.body.checkoutUrl).searchParams.get('ref')!;
      const event = {
        eventId: `evt-${randomUUID()}`,
        providerRef: ref,
        outcome: 'paid',
      };

      expect((await webhook(event)).body).toEqual({
        received: true,
        duplicate: false,
      });
      expect((await webhook(event)).body).toEqual({
        received: true,
        duplicate: true,
      });

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { bookingId: booking.id },
      });
      expect(payment).toMatchObject({
        status: 'paid',
        amountMinor: 5000,
        feeBps: 1500,
        feeMinor: 750,
        netMinor: 4250,
      });

      const confirmed = await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}`)
        .set('Cookie', mentee.cookie)
        .expect(200);
      expect(confirmed.body).toMatchObject({
        status: 'confirmed',
        session: { meetingUrl: 'https://meet.example.com/paid' },
      });

      await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(409);
    });

    it('keeps the booking waiting after a failed charge and allows a retry', async () => {
      const { mentee, booking } = await awaitingPayment();
      const first = await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(200);
      const firstRef = new URL(first.body.checkoutUrl).searchParams.get('ref')!;

      await webhook({
        eventId: `evt-${randomUUID()}`,
        providerRef: firstRef,
        outcome: 'failed',
      });

      const stillWaiting = await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}`)
        .set('Cookie', mentee.cookie)
        .expect(200);
      expect(stillWaiting.body.status).toBe('awaiting_payment');

      const retry = await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(200);
      const retryRef = new URL(retry.body.checkoutUrl).searchParams.get('ref')!;
      expect(retryRef).not.toBe(firstRef);

      // A late result for the old attempt cannot settle the new one.
      await webhook({
        eventId: `evt-${randomUUID()}`,
        providerRef: firstRef,
        outcome: 'paid',
      });
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { bookingId: booking.id },
      });
      expect(payment.status).toBe('pending');
    });

    it('only lets the owning mentee pay a booking awaiting payment', async () => {
      const { mentor, booking } = await awaitingPayment();
      const stranger = await createMentee();

      await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentor.cookie)
        .send({ bookingId: booking.id })
        .expect(403);

      await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', stranger.cookie)
        .send({ bookingId: booking.id })
        .expect(403);

      await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .send({ bookingId: booking.id })
        .expect(401);
    });

    it('never charges a free booking (R-07)', async () => {
      const { offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();
      const booking = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );

      const response = await request(app.getHttpServer())
        .post('/v1/payments/checkout')
        .set('Cookie', mentee.cookie)
        .send({ bookingId: booking.id })
        .expect(409);

      expect(response.body.code).toBe('BOOKING_NOT_AWAITING_PAYMENT');
      expect(await prisma.payment.count()).toBe(0);
    });

    it('rejects malformed webhooks and unknown providers', async () => {
      await webhook({ providerRef: 'nope' }, 400);
      await request(app.getHttpServer())
        .post('/v1/payments/webhooks/stripe')
        .send({})
        .expect(404);
    });

    it('enforces the fee split CHECK in PostgreSQL', async () => {
      const { booking } = await awaitingPayment();

      await expect(
        prisma.payment.create({
          data: {
            bookingId: booking.id,
            provider: 'fake',
            amountMinor: 1000,
            currency: 'PEN',
            feeBps: 1500,
            feeMinor: 150,
            netMinor: 900,
            idempotencyKey: `booking:${booking.id}`,
          },
        }),
      ).rejects.toThrow();
    });
  });

  it('queues one reminder per participant, once, a day before', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const early = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );
    const lastMinute = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 12),
    );
    for (const booking of [early, lastMinute]) {
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/accept`)
        .set('Cookie', mentor.cookie)
        .send({ meetingUrl: 'https://meet.example.com/abc' })
        .expect(200);
    }
    // Both start within the next day; only `early` was confirmed long ago.
    const now = Date.now();
    const moveSession = async (
      bookingId: string,
      startsInHours: number,
      confirmedHoursAgo: number,
    ) => {
      const record = await prisma.booking.update({
        where: { id: bookingId },
        data: { confirmedAt: new Date(now - confirmedHoursAgo * 3_600_000) },
      });
      const startsAt = new Date(now + startsInHours * 3_600_000);
      await prisma.session.update({
        where: { id: record.sessionId },
        data: {
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
        },
      });
    };
    await moveSession(early.id, 20, 10);
    await moveSession(lastMinute.id, 22, 1);
    await prisma.emailOutbox.deleteMany();

    await expect(bookings.sendDueReminders()).resolves.toBe(1);
    await expect(bookings.sendDueReminders()).resolves.toBe(0);

    const reminders = await prisma.emailOutbox.findMany({
      where: { kind: 'booking.reminder' },
    });
    expect(reminders.map((row) => row.toAddress).sort()).toEqual(
      [mentee.email, mentor.email].sort(),
    );
    expect(reminders[0].body).toContain('https://meet.example.com/abc');
    expect(reminders[0].body).toContain(`/call/${early.id}`);
    // Not worth sending once the session has started.
    expect(reminders[0].expiresAt).toEqual(
      (
        await prisma.booking.findUniqueOrThrow({
          where: { id: early.id },
          include: { session: true },
        })
      ).session.startsAt,
    );

    // Cancelling withdraws the reminders that did not leave yet.
    await request(app.getHttpServer())
      .post(`/v1/bookings/${early.id}/cancel`)
      .set('Cookie', mentee.cookie)
      .send({ reason: 'Surgió un imprevisto' })
      .expect(200);
    const withdrawn = await prisma.emailOutbox.findMany({
      where: { kind: 'booking.reminder' },
    });
    expect(withdrawn.map((row) => [row.status, row.body])).toEqual([
      ['expired', null],
      ['expired', null],
    ]);
  });
  describe('in-app call', () => {
    interface CallStream {
      next(): Promise<Record<string, unknown>>;
      close(): void;
      /** Resolves when the server ends the stream. */
      ended: Promise<void>;
    }

    let server: http.Server;
    let port: number;

    beforeAll(async () => {
      server = app.getHttpServer() as http.Server;
      await new Promise<void>((resolve) => server.listen(0, resolve));
      port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    /** Opens the event stream and reads it event by event (skipping pings). */
    function openStream(
      cookie: string,
      bookingId: string,
    ): Promise<CallStream> {
      return new Promise((resolve, reject) => {
        const queue: Record<string, unknown>[] = [];
        const waiters: Array<(event: Record<string, unknown>) => void> = [];
        let buffer = '';
        const req = http.get(
          {
            port,
            path: `/v1/bookings/${bookingId}/call/events`,
            headers: { Cookie: cookie, Accept: 'text/event-stream' },
          },
          (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`stream status ${res.statusCode}`));
              return;
            }
            res.setEncoding('utf8');
            const ended = new Promise<void>((done) => res.on('end', done));
            res.on('data', (chunk: string) => {
              buffer += chunk;
              let end: number;
              while ((end = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                const data = frame
                  .split('\n')
                  .find((line) => line.startsWith('data: '));
                if (!data) continue;
                const event = JSON.parse(data.slice(6)) as Record<
                  string,
                  unknown
                >;
                if (event.type === 'ping') continue;
                const waiter = waiters.shift();
                if (waiter) waiter(event);
                else queue.push(event);
              }
            });
            resolve({
              next: () => {
                const queued = queue.shift();
                if (queued) return Promise.resolve(queued);
                return new Promise((done) => waiters.push(done));
              },
              close: () => req.destroy(),
              ended,
            });
          },
        );
        req.on('error', () => undefined);
      });
    }

    async function confirmedBooking() {
      const { mentor, offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();
      const booking = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );
      // No link: the session happens inside Steam Society.
      const accepted = await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/accept`)
        .set('Cookie', mentor.cookie)
        .send({})
        .expect(200);
      expect(accepted.body).toMatchObject({ status: 'confirmed' });
      return { mentor, mentee, booking };
    }

    async function startSessionIn(bookingId: string, minutes: number) {
      const record = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      const startsAt = new Date(Date.now() + minutes * 60_000);
      await prisma.session.update({
        where: { id: record.sessionId },
        data: { startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) },
      });
    }

    it('opens shortly before the session, only for its participants', async () => {
      const { mentor, mentee, booking } = await confirmedBooking();
      const outsider = await createMentee();

      const early = await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call`)
        .set('Cookie', mentee.cookie)
        .expect(200);
      expect(early.body).toMatchObject({ open: false, iceServers: [] });
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/call/signal`)
        .set('Cookie', mentee.cookie)
        .send({ kind: 'candidate', candidate: null })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('CALL_NOT_OPEN'));

      await startSessionIn(booking.id, 10);

      const open = await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call`)
        .set('Cookie', mentor.cookie)
        .expect(200);
      expect(open.body).toMatchObject({
        open: true,
        role: 'mentor',
        meetingUrl: null,
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
      });
      await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call`)
        .set('Cookie', outsider.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call/events`)
        .set('Cookie', outsider.cookie)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/cancel`)
        .set('Cookie', mentee.cookie)
        .send({ reason: 'Surgió un imprevisto' })
        .expect(200);
      await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call`)
        .set('Cookie', mentee.cookie)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('CALL_UNAVAILABLE'));
    });

    it('relays the negotiation between mentee and mentor', async () => {
      const { mentor, mentee, booking } = await confirmedBooking();
      await startSessionIn(booking.id, 5);

      const menteeStream = await openStream(mentee.cookie, booking.id);
      await expect(menteeStream.next()).resolves.toEqual({
        type: 'ready',
        peerPresent: false,
      });

      const mentorStream = await openStream(mentor.cookie, booking.id);
      await expect(mentorStream.next()).resolves.toEqual({
        type: 'ready',
        peerPresent: true,
      });
      await expect(menteeStream.next()).resolves.toEqual({
        type: 'peer-joined',
      });

      const offer = {
        kind: 'description',
        description: { type: 'offer', sdp: 'v=0 test-only' },
      };
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/call/signal`)
        .set('Cookie', mentee.cookie)
        .send(offer)
        .expect(200, { delivered: true });
      await expect(mentorStream.next()).resolves.toEqual({
        type: 'signal',
        data: offer,
      });

      // Anything but a WebRTC signal is refused.
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/call/signal`)
        .set('Cookie', mentor.cookie)
        .send({ kind: 'chat', text: 'hola' })
        .expect(400);

      mentorStream.close();
      await expect(menteeStream.next()).resolves.toEqual({ type: 'peer-left' });
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/call/signal`)
        .set('Cookie', mentee.cookie)
        .send({ kind: 'candidate', candidate: null })
        .expect(200, { delivered: false });
      menteeStream.close();
    });

    it('ends the open streams when the booking is cancelled', async () => {
      const { mentor, mentee, booking } = await confirmedBooking();
      await startSessionIn(booking.id, 5);
      const menteeStream = await openStream(mentee.cookie, booking.id);
      await menteeStream.next();

      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/cancel`)
        .set('Cookie', mentor.cookie)
        .send({ reason: 'Surgió un imprevisto' })
        .expect(200);

      await menteeStream.ended;
      await request(app.getHttpServer())
        .get(`/v1/bookings/${booking.id}/call/events`)
        .set('Cookie', mentee.cookie)
        .expect(409);
    });
  });
  describe('trust & safety', () => {
    async function createAdmin(): Promise<{ cookie: string; id: string }> {
      const session = await registerAndLogin('mentee');
      const user = await prisma.user.update({
        where: { email: session.email },
        data: { role: 'admin' },
      });
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: session.email, password: session.password })
        .expect(200);
      const cookie = sessionCookie(login.headers['set-cookie']);
      await enrollTotp(app, cookie);
      return { cookie, id: user.id };
    }

    it('a block cancels the open bookings between both and stops new ones', async () => {
      const { mentor, offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();
      const other = await createMentee();
      const shared = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );
      const unrelated = await book(
        other.cookie,
        offering.id,
        limaInstant(targetDate, 11),
      );
      await prisma.emailOutbox.deleteMany();

      const blocked = await request(app.getHttpServer())
        .post('/v1/me/blocks')
        .set('Cookie', mentor.cookie)
        .send({ userId: mentee.userId })
        .expect(201);
      expect(blocked.body).toEqual({
        blockedUserId: mentee.userId,
        cancelledBookings: 1,
      });

      const after = await prisma.booking.findMany({
        where: { id: { in: [shared.id, unrelated.id] } },
        select: {
          id: true,
          status: true,
          cancelledBy: true,
          cancelReason: true,
        },
      });
      expect(after.find((b) => b.id === shared.id)).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'mentor',
        cancelReason: null,
      });
      expect(after.find((b) => b.id === unrelated.id)?.status).toBe(
        'requested',
      );
      // The blocked mentee is told about the cancellation, not the block.
      const mail = await prisma.emailOutbox.findFirstOrThrow({
        where: { kind: 'booking.cancelled' },
      });
      expect(mail.toAddress).toBe(mentee.email);
      expect(mail.body).not.toMatch(/bloque/i);

      // Same neutral error as an unavailable mentor.
      const retry = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Cookie', mentee.cookie)
        .send({
          offeringId: offering.id,
          startsAt: limaInstant(targetDate, 14),
        })
        .expect(409);
      expect(retry.body.code).not.toMatch(/BLOCK/);

      const list = await request(app.getHttpServer())
        .get('/v1/me/blocks')
        .set('Cookie', mentor.cookie)
        .expect(200);
      expect(list.body).toMatchObject([
        { userId: mentee.userId, role: 'mentee' },
      ]);

      await request(app.getHttpServer())
        .delete(`/v1/me/blocks/${mentee.userId}`)
        .set('Cookie', mentor.cookie)
        .expect(204);
      await book(mentee.cookie, offering.id, limaInstant(targetDate, 14));

      await request(app.getHttpServer())
        .post('/v1/me/blocks')
        .set('Cookie', mentor.cookie)
        .send({ userId: mentor.userId })
        .expect(400);
    });

    it('gives the team an overview, people and bookings to operate', async () => {
      const { mentor, offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();
      const admin = await createAdmin();
      const booking = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );
      await request(app.getHttpServer())
        .post(`/v1/bookings/${booking.id}/accept`)
        .set('Cookie', mentor.cookie)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/admin/overview')
        .set('Cookie', mentee.cookie)
        .expect(403);
      const overview = await request(app.getHttpServer())
        .get('/v1/admin/overview')
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(overview.body).toMatchObject({
        users: { mentee: { active: 1 }, mentor: { active: 1 } },
        mentors: { approved: 1 },
        bookingsLast30Days: { confirmed: 1 },
        openReports: 0,
      });

      const search = await request(app.getHttpServer())
        .get(
          `/v1/admin/users?q=${encodeURIComponent(mentee.email.slice(0, 20))}`,
        )
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(search.body.items).toMatchObject([
        { id: mentee.userId, role: 'mentee', status: 'active' },
      ]);
      const detail = await request(app.getHttpServer())
        .get(`/v1/admin/users/${mentor.userId}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(detail.body).toMatchObject({
        role: 'mentor',
        mentorStatus: 'approved',
        bookingsAsMentor: { confirmed: 1 },
      });

      const list = await request(app.getHttpServer())
        .get(`/v1/admin/bookings?status=confirmed&userId=${mentee.userId}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(list.body.items).toMatchObject([
        {
          id: booking.id,
          mentee: { id: mentee.userId },
          mentor: { id: mentor.userId },
        },
      ]);

      await prisma.emailOutbox.deleteMany();
      await request(app.getHttpServer())
        .post(`/v1/admin/bookings/${booking.id}/cancel`)
        .set('Cookie', admin.cookie)
        .send({ reason: 'La mentora tuvo una emergencia.' })
        .expect(200, { id: booking.id, status: 'cancelled' });
      const notified = await prisma.emailOutbox.findMany({
        where: { kind: 'booking.cancelled' },
        select: { toAddress: true },
      });
      expect(notified.map((row) => row.toAddress).sort()).toEqual(
        [mentee.email, mentor.email].sort(),
      );
      await request(app.getHttpServer())
        .post(`/v1/admin/bookings/${booking.id}/cancel`)
        .set('Cookie', admin.cookie)
        .send({ reason: 'Otra vez' })
        .expect(409);
    });

    it('a report reaches the queue and a suspension shuts the account out', async () => {
      const { mentor, offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();
      const other = await createMentee();
      const admin = await createAdmin();
      const booking = await book(
        mentee.cookie,
        offering.id,
        limaInstant(targetDate, 9),
      );
      const otherBooking = await book(
        other.cookie,
        offering.id,
        limaInstant(targetDate, 11),
      );
      await prisma.emailOutbox.deleteMany();

      // The booking must be between the two people.
      await request(app.getHttpServer())
        .post('/v1/reports')
        .set('Cookie', other.cookie)
        .send({
          reportedUserId: mentor.userId,
          bookingId: booking.id,
          reason: 'harassment',
        })
        .expect(400);

      const report = await request(app.getHttpServer())
        .post('/v1/reports')
        .set('Cookie', mentee.cookie)
        .send({
          reportedUserId: mentor.userId,
          bookingId: booking.id,
          reason: 'harassment',
          details: 'Me escribió mensajes fuera de lugar.',
        })
        .expect(201);
      // Moderators are alerted without names or details.
      const alert = await prisma.emailOutbox.findFirstOrThrow({
        where: { kind: 'safety.report_received' },
      });
      expect(alert.body).not.toContain('fuera de lugar');

      await request(app.getHttpServer())
        .get('/v1/admin/reports')
        .set('Cookie', mentee.cookie)
        .expect(403);
      const queue = await request(app.getHttpServer())
        .get('/v1/admin/reports')
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(queue.body.items).toMatchObject([
        {
          id: report.body.id,
          reason: 'harassment',
          reportedUser: { id: mentor.userId },
        },
      ]);
      const detail = await request(app.getHttpServer())
        .get(`/v1/admin/reports/${report.body.id}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(detail.body).toMatchObject({
        details: 'Me escribió mensajes fuera de lugar.',
        reportedUser: { reportsTotal: 1, reportsOpen: 1 },
        booking: { id: booking.id },
      });

      const resolved = await request(app.getHttpServer())
        .post(`/v1/admin/reports/${report.body.id}/resolve`)
        .set('Cookie', admin.cookie)
        .send({ action: 'suspend', note: 'Conducta confirmada.' })
        .expect(200);
      expect(resolved.body).toMatchObject({
        status: 'resolved',
        action: 'suspended',
      });
      await request(app.getHttpServer())
        .post(`/v1/admin/reports/${report.body.id}/resolve`)
        .set('Cookie', admin.cookie)
        .send({ action: 'dismiss', note: 'Otra vez' })
        .expect(409);

      // Signed out everywhere, cannot sign in, open bookings cancelled.
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', mentor.cookie)
        .expect(401);
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: mentor.email, password: mentor.password })
        .expect(401);
      const bookingsAfter = await prisma.booking.findMany({
        where: { id: { in: [booking.id, otherBooking.id] } },
        select: { status: true, cancelledBy: true },
      });
      expect(bookingsAfter).toEqual([
        { status: 'cancelled', cancelledBy: 'admin' },
        { status: 'cancelled', cancelledBy: 'admin' },
      ]);
      const audit = await prisma.auditLog.findMany({
        where: { entityId: { in: [mentor.userId, report.body.id] } },
        select: { action: true, actorUserId: true },
      });
      expect(audit.map((a) => a.action).sort()).toEqual([
        'report.resolved',
        'user.suspended',
      ]);

      await request(app.getHttpServer())
        .post(`/v1/admin/users/${mentor.userId}/reactivate`)
        .set('Cookie', admin.cookie)
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: mentor.email, password: mentor.password })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/v1/admin/users/${admin.id}/suspend`)
        .set('Cookie', admin.cookie)
        .send({ reason: 'prueba' })
        .expect(403);
    });
  });
});
