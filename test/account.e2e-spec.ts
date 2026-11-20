import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedTaxonomies } from '../prisma/seed-data.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BookingsService } from '../src/modules/bookings/application/bookings.service.js';
import {
  BOOKING_REPOSITORY,
  BookingPartyUnavailableError,
  type BookingRepositoryPort,
} from '../src/modules/bookings/application/ports/booking.repository.js';
import { BookingsPersonalData } from '../src/modules/bookings/infrastructure/bookings-personal-data.js';
import type { AuthUser } from '../src/modules/auth/auth.types.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';
import { currentTotp, enrollTotp, markEmailVerified } from './helpers/auth.js';

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
}

interface BookingBody {
  id: string;
  status: string;
}

interface ExportBody {
  format: string;
  userId: string;
  sections: Record<string, unknown>;
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

describe('Account data rights (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let science: { id: string; name: string; parentId: string | null };
  let biology: { id: string; name: string; parentId: string | null };
  let technology: { id: string; name: string; parentId: string | null };
  let ai: { id: string; name: string; parentId: string | null };
  let targetDate: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The 3/min limit is per route; these tests call each route more often.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
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
    const email = `account-${randomUUID()}@example.com`;
    const password = 'test-only-correct-horse-battery';

    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password,
        role,
        birthDate: '1998-01-01',
        acceptTerms: true,
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

  function deleteAccount(cookie: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/v1/me/delete')
      .set('Cookie', cookie)
      .send(body);
  }

  it('exports every section as a JSON download', async () => {
    const { mentor } = await prepareMentorWithOffering();

    const response = await request(app.getHttpServer())
      .get('/v1/me/export')
      .set('Cookie', mentor.cookie)
      .expect(200);

    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="?steam-society-mis-datos-\d{4}-\d{2}-\d{2}\.json"?$/,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as ExportBody;
    expect(body.format).toBe('steam-society-export/v1');
    expect(body.userId).toBe(mentor.userId);
    expect(Object.keys(body.sections).sort()).toEqual([
      'account',
      'bookings',
      'profile',
      'safety',
      'scheduling',
    ]);
    expect(body.sections.safety).toEqual({ blocks: [], reportsFiled: [] });
    expect(body.sections.account).toMatchObject({ email: mentor.email });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('requires the password and the typed confirmation', async () => {
    const mentee = await createMentee();

    await deleteAccount(mentee.cookie, { password: mentee.password }).expect(
      400,
    );
    await deleteAccount(mentee.cookie, {
      password: 'test-only-wrong-password',
      confirmation: 'ELIMINAR',
    }).expect(401);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: mentee.userId },
    });
    expect(user.deletedAt).toBeNull();
  });

  it('refuses while a booking is open and deletes once it is cancelled', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const booking = await book(
      mentee.cookie,
      offering.id,
      limaInstant(targetDate, 9),
    );

    const refused = await deleteAccount(mentor.cookie, {
      password: mentor.password,
      confirmation: 'ELIMINAR',
    }).expect(409);
    expect(refused.body.code).toBe('ACCOUNT_HAS_OPEN_BOOKINGS');

    await request(app.getHttpServer())
      .post(`/v1/bookings/${booking.id}/cancel`)
      .set('Cookie', mentee.cookie)
      .send({})
      .expect(200);

    // A second session, to check that deletion signs out everywhere.
    const otherLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: mentor.email, password: mentor.password })
      .expect(200);
    const otherCookie = sessionCookie(otherLogin.headers['set-cookie']);

    await deleteAccount(mentor.cookie, {
      password: mentor.password,
      confirmation: 'ELIMINAR',
    }).expect(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: mentor.userId },
    });
    expect(user).toMatchObject({
      email: `deleted-${mentor.userId}@deleted.invalid`,
      passwordHash: null,
      firstName: null,
      lastName: null,
      status: 'deleted',
    });
    expect(user.deletedAt).not.toBeNull();
    expect(
      await prisma.mentorProfile.findUniqueOrThrow({
        where: { userId: mentor.userId },
      }),
    ).toMatchObject({ status: 'suspended' });
    expect(
      await prisma.availabilityRule.count({
        where: { userId: mentor.userId },
      }),
    ).toBe(0);
    expect(
      await prisma.offering.count({
        where: { mentorId: mentor.userId, active: true },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: 'user.deleted', entityId: mentor.userId },
      }),
    ).toBe(1);
    // The booking notices queued for the mentor went with the account.
    expect(
      await prisma.emailOutbox.count({ where: { toAddress: mentor.email } }),
    ).toBe(0);
    expect(
      await prisma.emailOutbox.count({ where: { toAddress: mentee.email } }),
    ).toBeGreaterThan(0);

    for (const cookie of [mentor.cookie, otherCookie]) {
      await request(app.getHttpServer())
        .get('/v1/me')
        .set('Cookie', cookie)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: mentor.email, password: mentor.password })
      .expect(401);

    const catalog = await request(app.getHttpServer())
      .get('/v1/mentors')
      .expect(200);
    expect(
      (catalog.body as { items: { userId: string }[] }).items.map(
        (item) => item.userId,
      ),
    ).not.toContain(mentor.userId);

    // The mentee keeps their (cancelled) booking history.
    expect(await prisma.booking.count({ where: { id: booking.id } })).toBe(1);
  });

  it('asks for the second factor when the account has one', async () => {
    const mentee = await createMentee();
    const { secret } = await enrollTotp(app, mentee.cookie, mentee.password);

    const missing = await deleteAccount(mentee.cookie, {
      password: mentee.password,
      confirmation: 'ELIMINAR',
    }).expect(400);
    expect(missing.body.code).toBe('MFA_CODE_REQUIRED');

    await deleteAccount(mentee.cookie, {
      password: mentee.password,
      code: currentTotp(secret, 1),
      confirmation: 'ELIMINAR',
    }).expect(204);

    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: mentee.userId } }),
    ).toMatchObject({ status: 'deleted' });
  });

  it('does not let an admin delete their own account', async () => {
    const admin = await createMentee();
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'admin' },
    });
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    const cookie = sessionCookie(login.headers['set-cookie']);
    const { secret } = await enrollTotp(app, cookie, admin.password);

    const response = await deleteAccount(cookie, {
      password: admin.password,
      code: currentTotp(secret, 1),
      confirmation: 'ELIMINAR',
    }).expect(403);
    expect(response.body.code).toBe('ADMIN_SELF_DELETE_FORBIDDEN');
  });

  it('re-checks open bookings inside the deletion transaction', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    await book(mentee.cookie, offering.id, limaInstant(targetDate, 9));
    const contributor = app.get(BookingsPersonalData);

    // As if the booking arrived after assertErasable ran.
    await expect(
      prisma.$transaction((tx) =>
        contributor.erase(tx, mentor.userId, new Date()),
      ),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_HAS_OPEN_BOOKINGS' },
    });
  });

  it('does not book for a mentee deleted while the request was in flight', async () => {
    const { offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Cookie', mentee.cookie)
      .expect(200);
    const staleUser = me.body as AuthUser;
    await prisma.user.update({
      where: { id: mentee.userId },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    await expect(
      app.get(BookingsService).create(staleUser, {
        offeringId: offering.id,
        startsAt: limaInstant(targetDate, 9),
      }),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_SLOT_UNAVAILABLE' },
    });
    expect(await prisma.booking.count()).toBe(0);
  });

  it('never leaves an open booking on a deleted account (concurrent requests)', async () => {
    for (let round = 0; round < 3; round += 1) {
      const { mentor, offering } = await prepareMentorWithOffering();
      const mentee = await createMentee();

      const [booking, deletion] = await Promise.all([
        request(app.getHttpServer())
          .post('/v1/bookings')
          .set('Cookie', mentee.cookie)
          .send({
            offeringId: offering.id,
            startsAt: limaInstant(targetDate, 9),
          }),
        deleteAccount(mentor.cookie, {
          password: mentor.password,
          confirmation: 'ELIMINAR',
        }),
      ]);

      // Exactly one wins; never a 500 from a deadlock.
      expect(booking.status < 500 && deletion.status < 500).toBe(true);
      expect(booking.status === 201 && deletion.status === 204).toBe(false);
      const deleted =
        (await prisma.user.findUniqueOrThrow({ where: { id: mentor.userId } }))
          .status === 'deleted';
      const openBookings = await prisma.booking.count({
        where: { session: { mentorId: mentor.userId }, status: 'requested' },
      });
      expect(deleted && openBookings > 0).toBe(false);

      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "booking", "session", "availability_rule", "offering", "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "auth_session", "user" CASCADE',
      );
    }
  });

  it('does not book with a mentor deleted while the request was in flight', async () => {
    const { mentor, offering } = await prepareMentorWithOffering();
    const mentee = await createMentee();
    // Only the user row: the offering stays active, so the check inside the
    // booking transaction is what refuses (the service checks ran before).
    await prisma.user.update({
      where: { id: mentor.userId },
      data: { status: 'deleted', deletedAt: new Date() },
    });
    const startsAt = new Date(limaInstant(targetDate, 9));
    const repository = app.get<BookingRepositoryPort>(BOOKING_REPOSITORY);

    await expect(
      repository.create({
        offeringId: offering.id,
        mentorId: mentor.userId,
        menteeId: mentee.userId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        paymentRequired: false,
        priceMinor: 0,
        currency: 'PEN',
        message: null,
      }),
    ).rejects.toBeInstanceOf(BookingPartyUnavailableError);
    expect(await prisma.booking.count()).toBe(0);
  });
});
