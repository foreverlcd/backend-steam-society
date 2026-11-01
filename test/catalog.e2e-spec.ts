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

interface UserSession extends AuthSession {
  userId: string;
}

interface Area {
  id: string;
  name: string;
  parentId: string | null;
}

interface CatalogBody {
  items: Array<{
    userId: string;
    headline: string | null;
    country: string | null;
    city: string | null;
    areas: Array<{ id: string; name: string }>;
    languages: Array<{ code: string; name: string }>;
    offerings: Array<{
      id: string;
      title: string;
      isFree: boolean;
      priceMinor: number;
      currency: string;
    }>;
  }>;
  nextCursor: string | null;
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

describe('Catalog and recommendations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let technology: Area;
  let ai: Area;
  let science: Area;
  let biology: Area;

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
    science = areas.find((area) => area.name === 'Ciencia')!;
    biology = areas.find((area) => area.name === 'Biología')!;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "booking", "session", "availability_rule", "offering", "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "password_reset_token", "auth_session", "user" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    role: 'mentor' | 'mentee',
  ): Promise<AuthSession> {
    const email = `catalog-${randomUUID()}@example.com`;
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

  async function completeMentorOnboarding(
    cookie: string,
    areas: { primaryAreaId: string; areaIds: string[] },
  ): Promise<void> {
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
          primaryAreaId: areas.primaryAreaId,
          areaIds: areas.areaIds,
          supportTypes: ['study_plan', 'portfolio'],
          industries: ['tech_saas'],
          mentoringLevels: ['beginner', 'intermediate'],
          menteeStages: ['university'],
          languageCodes: ['es'],
          availabilityPreferences: ['mornings'],
        },
      })
      .expect(200);
  }

  async function completeMenteeOnboarding(
    cookie: string,
    areas: { primaryAreaId: string; areaIds: string[] },
  ): Promise<void> {
    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: {
          city: 'Arequipa',
          country: 'PE',
          stage: 'university',
          primaryAreaId: areas.primaryAreaId,
          areaIds: areas.areaIds,
          mainGoal: 'decide_career',
          supportTypes: ['scholarships'],
          industries: ['research'],
          currentLevel: 'beginner',
          languageCodes: ['es'],
          availabilityPreferences: ['mornings'],
        },
      })
      .expect(200);
  }

  async function setAvailability(cookie: string): Promise<void> {
    const rules = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '12:00',
      timezone: 'America/Lima',
      validFrom: limaDate(0),
      validTo: limaDate(20),
    }));

    await request(app.getHttpServer())
      .put('/v1/me/availability')
      .set('Cookie', cookie)
      .send({ rules })
      .expect(200);
  }

  async function createMentor(
    options: {
      approved?: boolean;
      areas?: { primaryAreaId: string; areaIds: string[] };
      availability?: boolean;
      offering?: Record<string, unknown> | null;
    } = {},
  ): Promise<UserSession> {
    const session = await registerAndLogin('mentor');
    await completeMentorOnboarding(
      session.cookie,
      options.areas ?? { primaryAreaId: technology.id, areaIds: [ai.id] },
    );
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

    if (options.availability !== false && options.approved !== false) {
      await setAvailability(session.cookie);
    }

    if (options.offering !== null) {
      await request(app.getHttpServer())
        .post('/v1/me/offerings')
        .set('Cookie', session.cookie)
        .send({
          title: 'Mentoría',
          durationMinutes: 60,
          isFree: true,
          ...options.offering,
        })
        .expect(201);
    }

    return { ...session, userId: user.id };
  }

  async function createMentee(
    areas: { primaryAreaId: string; areaIds: string[] } = {
      primaryAreaId: science.id,
      areaIds: [biology.id],
    },
  ): Promise<UserSession> {
    const session = await registerAndLogin('mentee');
    await completeMenteeOnboarding(session.cookie, areas);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: session.email },
    });

    return { ...session, userId: user.id };
  }

  it('searches only approved mentors and filters by text, area, language and price', async () => {
    const dataMentor = await createMentor({
      offering: {
        title: 'Datos para principiantes',
        isFree: true,
      },
    });
    const biologyMentor = await createMentor({
      areas: { primaryAreaId: science.id, areaIds: [biology.id] },
      offering: {
        title: 'Biología aplicada',
        isFree: false,
        priceMinor: 5000,
      },
    });
    await createMentor({ approved: false, offering: null });

    await prisma.mentorProfile.update({
      where: { userId: dataMentor.userId },
      data: {
        headline: 'Ingeniera de datos',
        bio: 'Mentora en inteligencia artificial y análisis de datos',
        country: 'PE',
        city: 'Lima',
      },
    });
    await prisma.mentorProfile.update({
      where: { userId: biologyMentor.userId },
      data: {
        headline: 'Bióloga marina',
        bio: 'Investigación en biología y conservación',
        country: 'CO',
        city: 'Bogotá',
      },
    });
    await prisma.mentorLanguage.create({
      data: { mentorId: biologyMentor.userId, languageCode: 'en' },
    });
    await prisma.mentorLanguage.deleteMany({
      where: { mentorId: biologyMentor.userId, languageCode: 'es' },
    });

    const all = await request(app.getHttpServer())
      .get('/v1/mentors')
      .expect(200);
    const allBody = all.body as CatalogBody;
    expect(allBody.items).toHaveLength(2);
    expect(allBody.items.map((item) => item.userId)).toEqual(
      expect.arrayContaining([dataMentor.userId, biologyMentor.userId]),
    );
    expect(allBody.items[0].offerings).toHaveLength(1);

    const byText = await request(app.getHttpServer())
      .get('/v1/mentors?q=datos')
      .expect(200);
    expect((byText.body as CatalogBody).items.map((item) => item.userId)).toEqual(
      [dataMentor.userId],
    );

    const byArea = await request(app.getHttpServer())
      .get(`/v1/mentors?areaId=${ai.id}`)
      .expect(200);
    expect((byArea.body as CatalogBody).items.map((item) => item.userId)).toEqual(
      [dataMentor.userId],
    );

    const byLanguage = await request(app.getHttpServer())
      .get('/v1/mentors?language=en')
      .expect(200);
    expect(
      (byLanguage.body as CatalogBody).items.map((item) => item.userId),
    ).toEqual([biologyMentor.userId]);

    const byCountry = await request(app.getHttpServer())
      .get('/v1/mentors?country=CO')
      .expect(200);
    expect(
      (byCountry.body as CatalogBody).items.map((item) => item.userId),
    ).toEqual([biologyMentor.userId]);

    const free = await request(app.getHttpServer())
      .get('/v1/mentors?isFree=true')
      .expect(200);
    expect((free.body as CatalogBody).items.map((item) => item.userId)).toEqual([
      dataMentor.userId,
    ]);

    const budget = await request(app.getHttpServer())
      .get('/v1/mentors?maxPriceMinor=4000&currency=PEN')
      .expect(200);
    expect((budget.body as CatalogBody).items.map((item) => item.userId)).toEqual(
      [dataMentor.userId],
    );
  });

  it('paginates with an opaque cursor without repeating mentors', async () => {
    await createMentor({ offering: null });
    await createMentor({ offering: null });

    const first = await request(app.getHttpServer())
      .get('/v1/mentors?limit=1')
      .expect(200);
    const firstBody = first.body as CatalogBody;
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await request(app.getHttpServer())
      .get(
        `/v1/mentors?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
      )
      .expect(200);
    const secondBody = second.body as CatalogBody;
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0].userId).not.toBe(firstBody.items[0].userId);
    expect(secondBody.nextCursor).toBeNull();

    const invalid = await request(app.getHttpServer())
      .get('/v1/mentors?cursor=not-a-cursor')
      .expect(400);
    expect(invalid.body.code).toBe('INVALID_CURSOR');
  });

  it('returns a public mentor detail and hides non-approved profiles', async () => {
    const mentor = await createMentor({
      offering: { title: 'Mentoría gratuita', isFree: true },
    });
    const pending = await createMentor({ approved: false, offering: null });

    const detail = await request(app.getHttpServer())
      .get(`/v1/mentors/${mentor.userId}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      userId: mentor.userId,
      offerings: [
        expect.objectContaining({
          title: 'Mentoría gratuita',
          isFree: true,
        }),
      ],
    });

    const hidden = await request(app.getHttpServer())
      .get(`/v1/mentors/${pending.userId}`)
      .expect(404);
    expect(hidden.body.code).toBe('MENTOR_NOT_FOUND');

    const missing = await request(app.getHttpServer())
      .get(`/v1/mentors/${randomUUID()}`)
      .expect(404);
    expect(missing.body.code).toBe('MENTOR_NOT_FOUND');
  });

  it('recommends eligible mentors to a mentee with an explainable breakdown', async () => {
    const best = await createMentor({
      offering: { title: 'Mentoría gratuita', isFree: true },
    });
    const paid = await createMentor({
      offering: {
        title: 'Mentoría de pago',
        isFree: false,
        priceMinor: 5000,
      },
    });
    await createMentor({ availability: false, offering: null });
    await createMentor({ approved: false, offering: null });
    await createMentor({
      areas: { primaryAreaId: science.id, areaIds: [biology.id] },
      offering: null,
    });

    const mentee = await createMentee({
      primaryAreaId: technology.id,
      areaIds: [ai.id],
    });
    const response = await request(app.getHttpServer())
      .get('/v1/me/recommendations')
      .set('Cookie', mentee.cookie)
      .expect(200);

    expect(response.body.meta).toMatchObject({
      totalCandidates: 4,
      eligibleCandidates: 2,
      horizonDays: 14,
      limit: 3,
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      mentorId: best.userId,
      score: expect.any(Number),
      reason: expect.any(String),
    });
    expect(response.body.items[0].breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: 'areas', max: 35 }),
        expect.objectContaining({ signal: 'availability', max: 20 }),
        expect.objectContaining({ signal: 'language', max: 15 }),
        expect.objectContaining({ signal: 'price_fit', max: 10 }),
      ]),
    );
    expect(response.body.items[1].mentorId).toBe(paid.userId);

    const limited = await request(app.getHttpServer())
      .get('/v1/me/recommendations?limit=1')
      .set('Cookie', mentee.cookie)
      .expect(200);
    expect(limited.body.items).toHaveLength(1);
    expect(limited.body.meta.limit).toBe(1);
  });

  it('rejects recommendations for mentors and mentees without a profile', async () => {
    const mentor = await createMentor({ offering: null });
    await request(app.getHttpServer())
      .get('/v1/me/recommendations')
      .set('Cookie', mentor.cookie)
      .expect(403);

    const mentee = await registerAndLogin('mentee');
    const response = await request(app.getHttpServer())
      .get('/v1/me/recommendations')
      .set('Cookie', mentee.cookie)
      .expect(400);
    expect(response.body.code).toBe('MENTEE_PROFILE_REQUIRED');
  });
});
