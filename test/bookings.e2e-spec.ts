import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedTaxonomies } from '../prisma/seed-data.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BookingsService } from '../src/modules/bookings/application/bookings.service.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';

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
  const millis = Date.now() + offsetDays * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000;
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
      'TRUNCATE TABLE "booking", "session", "availability_rule", "offering", "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "password_reset_token", "auth_session", "user" CASCADE',
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

  it('accepts a free request only with a meeting URL', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    const missingUrl = await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/accept`)
      .set('Cookie', mentor.cookie)
      .send({})
      .expect(400);
    expect(missingUrl.body.code).toBe('MEETING_URL_REQUIRED');

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

    expect(noShow.body).toMatchObject({
      status: 'no_show',
      noShowParty: 'mentee',
    });
  });
});
