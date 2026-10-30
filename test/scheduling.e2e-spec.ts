import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedTaxonomies } from '../prisma/seed-data.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';

interface AuthSession {
  cookie: string;
  email: string;
  password: string;
}

interface MentorSession extends AuthSession {
  userId: string;
}

interface OfferingBody {
  id: string;
  mentorId: string;
  title: string;
  description: string | null;
  type: string;
  durationMinutes: number;
  capacity: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
  active: boolean;
  archivedAt: string | null;
}

function localTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
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

describe('Offerings and availability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let technology: { id: string; name: string; parentId: string | null };
  let ai: { id: string; name: string; parentId: string | null };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await seedTaxonomies(prisma);

    const areas = await prisma.area.findMany({
      select: { id: true, name: true, parentId: true },
    });
    technology = areas.find((area) => area.name === 'Tecnología')!;
    ai = areas.find((area) => area.name === 'Inteligencia artificial')!;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "availability_rule", "offering", "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "password_reset_token", "auth_session", "user" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    role: 'mentor' | 'mentee',
  ): Promise<AuthSession> {
    const email = `scheduling-${randomUUID()}@example.com`;
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

  async function createMentor(
    options: { approved?: boolean } = {},
  ): Promise<MentorSession> {
    const session = await registerAndLogin('mentor');
    await completeMentorOnboarding(session.cookie);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: session.email },
    });

    await prisma.mentorProfile.update({
      where: { userId: user.id },
      data: {
        status: options.approved === false ? 'pending_review' : 'approved',
        minNoticeHours: 0,
        maxAdvanceDays: 60,
      },
    });

    return { ...session, userId: user.id };
  }

  async function createOffering(
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<OfferingBody> {
    const response = await request(app.getHttpServer())
      .post('/v1/me/offerings')
      .set('Cookie', cookie)
      .send(body)
      .expect(201);

    return response.body as OfferingBody;
  }

  it('creates, lists, updates and archives an offering', async () => {
    const mentor = await createMentor();
    const offering = await createOffering(mentor.cookie, {
      title: 'Mentoría gratuita',
      description: 'Conversación inicial',
      durationMinutes: 60,
      isFree: true,
    });

    expect(offering).toMatchObject({
      mentorId: mentor.userId,
      title: 'Mentoría gratuita',
      description: 'Conversación inicial',
      type: 'one_to_one',
      durationMinutes: 60,
      capacity: 1,
      isFree: true,
      priceMinor: 0,
      currency: 'PEN',
      active: true,
      archivedAt: null,
    });

    const list = await request(app.getHttpServer())
      .get('/v1/me/offerings')
      .set('Cookie', mentor.cookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(offering.id);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/me/offerings/${offering.id}`)
      .set('Cookie', mentor.cookie)
      .send({
        title: 'Mentoría de portafolio',
        isFree: false,
        priceMinor: 2500,
        currency: 'PEN',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: 'Mentoría de portafolio',
      isFree: false,
      priceMinor: 2500,
      currency: 'PEN',
    });

    const archived = await request(app.getHttpServer())
      .post(`/v1/me/offerings/${offering.id}/archive`)
      .set('Cookie', mentor.cookie)
      .expect(200);
    expect(archived.body.active).toBe(false);
    expect(archived.body.archivedAt).toEqual(expect.any(String));

    const conflict = await request(app.getHttpServer())
      .patch(`/v1/me/offerings/${offering.id}`)
      .set('Cookie', mentor.cookie)
      .send({ title: 'No se puede editar' })
      .expect(409);
    expect(conflict.body.code).toBe('OFFERING_ARCHIVED');
  });

  it('requires an approved mentor to create offerings', async () => {
    const mentor = await createMentor({ approved: false });

    const response = await request(app.getHttpServer())
      .post('/v1/me/offerings')
      .set('Cookie', mentor.cookie)
      .send({
        title: 'Mentoría',
        durationMinutes: 60,
        isFree: true,
      })
      .expect(403);

    expect(response.body.code).toBe('MENTOR_NOT_APPROVED');
  });

  it('enforces offering CHECK constraints in PostgreSQL', async () => {
    const mentor = await createMentor();
    const base = {
      mentorId: mentor.userId,
      title: 'CHECK offering',
      durationMinutes: 60,
      capacity: 1,
      isFree: true,
      priceMinor: 0,
      currency: 'PEN',
    };

    await expect(
      prisma.offering.create({
        data: { ...base, priceMinor: 100 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.offering.create({
        data: { ...base, isFree: false, priceMinor: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.offering.create({
        data: { ...base, durationMinutes: 10 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.offering.create({
        data: { ...base, capacity: 2 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.offering.create({
        data: { ...base, currency: 'pen' },
      }),
    ).rejects.toThrow();
  });

  it('enforces availability CHECK constraints in PostgreSQL', async () => {
    const mentor = await createMentor();
    const base = {
      userId: mentor.userId,
      weekday: 1,
      startTime: localTime('09:00'),
      endTime: localTime('10:00'),
      timezone: 'America/Lima',
    };

    await expect(
      prisma.availabilityRule.create({
        data: { ...base, weekday: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.availabilityRule.create({
        data: { ...base, endTime: localTime('08:00') },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.availabilityRule.create({
        data: {
          ...base,
          validFrom: new Date('2026-12-01T00:00:00.000Z'),
          validTo: new Date('2026-11-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('saves availability and returns public slots', async () => {
    const mentor = await createMentor();
    const offering = await createOffering(mentor.cookie, {
      title: 'Mentoría con slots',
      durationMinutes: 60,
      isFree: true,
    });

    const target = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const targetDate = target.toISOString().slice(0, 10);
    const from = `${targetDate}T00:00:00.000Z`;
    const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();

    const rules = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '11:00',
      timezone: 'America/Lima',
      validFrom: targetDate,
      validTo: targetDate,
    }));

    const saved = await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', mentor.cookie)
      .send({ rules })
      .expect(200);
    expect(saved.body.timezone).toBe('America/Lima');
    expect(saved.body.rules).toHaveLength(7);
    expect(saved.body.rules[0]).toMatchObject({
      validFrom: targetDate,
      validTo: targetDate,
    });

    const fetched = await request(app.getHttpServer())
      .get('/v1/me/availability')
      .set('Cookie', mentor.cookie)
      .expect(200);
    expect(fetched.body.rules).toHaveLength(7);
    expect(fetched.body.rules[0]).toMatchObject({
      validFrom: targetDate,
      validTo: targetDate,
    });

    const slots = await request(app.getHttpServer())
      .get(`/v1/mentors/${mentor.userId}/slots`)
      .query({ offeringId: offering.id, from, to })
      .expect(200);

    expect(slots.body).toMatchObject({
      mentorId: mentor.userId,
      offeringId: offering.id,
      durationMinutes: 60,
    });
    expect(slots.body.slots).toHaveLength(2);
    expect(slots.body.slots[0]).toMatchObject({
      timezone: 'America/Lima',
      localStart: `${targetDate}T09:00`,
      localEnd: `${targetDate}T10:00`,
    });
    expect(slots.body.slots[1]).toMatchObject({
      localStart: `${targetDate}T10:00`,
      localEnd: `${targetDate}T11:00`,
    });
  });

  it('validates availability rules', async () => {
    const mentor = await createMentor();

    const invalidTimezone = await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', mentor.cookie)
      .send({
        rules: [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '10:00',
            timezone: 'Not/AZone',
          },
        ],
      })
      .expect(400);
    expect(invalidTimezone.body.code).toBe('INVALID_TIMEZONE');

    const invalidRange = await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', mentor.cookie)
      .send({
        rules: [
          {
            weekday: 1,
            startTime: '10:00',
            endTime: '09:00',
          },
        ],
      })
      .expect(400);
    expect(invalidRange.body.code).toBe('INVALID_AVAILABILITY_RANGE');

    await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', mentor.cookie)
      .send({
        rules: [
          {
            weekday: 1,
            startTime: '9:00',
            endTime: '10:00',
          },
        ],
      })
      .expect(400);
  });

  it('hides slots when the mentor is no longer approved', async () => {
    const mentor = await createMentor();
    const offering = await createOffering(mentor.cookie, {
      title: 'Mentoría',
      durationMinutes: 60,
      isFree: true,
    });

    await prisma.mentorProfile.update({
      where: { userId: mentor.userId },
      data: { status: 'pending_review' },
    });

    const targetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = `${targetDate}T00:00:00.000Z`;
    const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app.getHttpServer())
      .get(`/v1/mentors/${mentor.userId}/slots`)
      .query({ offeringId: offering.id, from, to })
      .expect(404);

    expect(response.body.code).toBe('OFFERING_NOT_FOUND');
  });

  it('does not expose archived offerings in public slots', async () => {
    const mentor = await createMentor();
    const offering = await createOffering(mentor.cookie, {
      title: 'Mentoría',
      durationMinutes: 60,
      isFree: true,
    });

    await request(app.getHttpServer())
      .post(`/v1/me/offerings/${offering.id}/archive`)
      .set('Cookie', mentor.cookie)
      .expect(200);

    const targetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = `${targetDate}T00:00:00.000Z`;
    const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app.getHttpServer())
      .get(`/v1/mentors/${mentor.userId}/slots`)
      .query({ offeringId: offering.id, from, to })
      .expect(404);

    expect(response.body.code).toBe('OFFERING_NOT_FOUND');
  });
});
