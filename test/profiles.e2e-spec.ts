import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { seedTaxonomies } from '../prisma/seed-data.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/shared/prisma/prisma.service.js';

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

describe('Profiles and onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let technology: { id: string; name: string; parentId: string | null };
  let ai: { id: string; name: string; parentId: string | null };
  let science: { id: string; name: string; parentId: string | null };
  let biology: { id: string; name: string; parentId: string | null };

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
      'TRUNCATE TABLE "audit_log", "onboarding_response", "mentee_language", "mentor_language", "mentee_interest", "mentor_area", "mentee_profile", "mentor_profile", "password_reset_token", "auth_session", "user" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    role: 'mentor' | 'mentee',
  ): Promise<{ cookie: string; email: string; password: string }> {
    const email = `profile-${randomUUID()}@example.com`;
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

  async function createAdmin(): Promise<{ cookie: string; id: string }> {
    const { email, password } = await registerAndLogin('mentee');
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
    });
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return { cookie: sessionCookie(login.headers['set-cookie']), id: user.id };
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

  async function submitMentor(cookie: string): Promise<void> {
    await request(app.getHttpServer())
      .post('/v1/me/profile/submit')
      .set('Cookie', cookie)
      .expect(200);
  }

  it('returns versioned onboarding config with taxonomy options', async () => {
    const { cookie } = await registerAndLogin('mentor');

    const response = await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.version).toBe(1);
    expect(response.body.role).toBe('mentor');
    expect(response.body.steps).toHaveLength(4);
    expect(response.body.completion).toEqual({
      complete: false,
      missing: expect.arrayContaining(['city', 'primaryAreaId']),
    });
    expect(response.body.options.areas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: technology.id, name: 'Tecnología' }),
      ]),
    );
    expect(response.body.options.languages).toContainEqual({
      code: 'es',
      name: 'Español',
    });
  });

  it('stores mentor onboarding answers and projects them into the profile', async () => {
    const { cookie } = await registerAndLogin('mentor');
    await completeMentorOnboarding(cookie);

    const response = await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.profile).toMatchObject({
      status: 'draft',
      country: 'PE',
      city: 'Lima',
      yearsExperience: 6,
    });
    expect(response.body.profile.areas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: technology.id }),
        expect.objectContaining({ id: ai.id }),
      ]),
    );
    expect(response.body.profile.languages).toEqual([
      { code: 'es', name: 'Español' },
    ]);

    const stored = await prisma.onboardingResponse.findMany();
    expect(stored).toHaveLength(13);
    expect(stored.every((row) => row.version === 1)).toBe(true);

    const onboarding = await request(app.getHttpServer())
      .get('/v1/me/onboarding')
      .set('Cookie', cookie)
      .expect(200);
    expect(onboarding.body.completion).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('stores mentee onboarding answers and maps stage to education level', async () => {
    const { cookie } = await registerAndLogin('mentee');

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

    const response = await request(app.getHttpServer())
      .get('/v1/me/profile')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.profile).toMatchObject({
      country: 'PE',
      city: 'Arequipa',
      educationLevel: 'undergraduate',
      careerStage: 'university',
    });
    expect(response.body.profile.areas).toHaveLength(2);

    const updated = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', cookie)
      .send({ careerStage: 'early_career' })
      .expect(200);
    expect(updated.body.profile).toMatchObject({
      careerStage: 'early_career',
      educationLevel: 'career_change',
    });

    const areaUpdate = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', cookie)
      .send({ areaIds: [science.id, biology.id] })
      .expect(200);
    expect(areaUpdate.body.profile.areas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: science.id }),
        expect.objectContaining({ id: biology.id }),
      ]),
    );

    const invalidAreaUpdate = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', cookie)
      .send({ areaIds: [ai.id] })
      .expect(400);
    expect(invalidAreaUpdate.body.code).toBe('INVALID_SUBAREA');
  });

  it('submits, approves and audits a mentor profile', async () => {
    const mentor = await registerAndLogin('mentor');
    const admin = await createAdmin();
    await completeMentorOnboarding(mentor.cookie);
    await submitMentor(mentor.cookie);

    const pending = await request(app.getHttpServer())
      .get('/v1/admin/mentors?status=pending_review')
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(pending.body.items).toHaveLength(1);

    const approved = await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${pending.body.items[0].userId}/approve`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(approved.body.profile.status).toBe('approved');

    const audits = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      'mentor_profile.submitted',
      'mentor_profile.approved',
    ]);
    expect(audits[1].actorUserId).toBe(admin.id);

    await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${pending.body.items[0].userId}/approve`)
      .set('Cookie', admin.cookie)
      .expect(409);
  });

  it('rejects with a reason and clears it when the mentor resubmits', async () => {
    const mentor = await registerAndLogin('mentor');
    const admin = await createAdmin();
    await completeMentorOnboarding(mentor.cookie);
    await submitMentor(mentor.cookie);
    const mentorId = (await prisma.mentorProfile.findFirstOrThrow()).userId;

    const rejected = await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${mentorId}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Falta detalle en la experiencia' })
      .expect(200);

    expect(rejected.body.profile).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Falta detalle en la experiencia',
    });

    await submitMentor(mentor.cookie);

    const profile = await prisma.mentorProfile.findFirstOrThrow();
    expect(profile.status).toBe('pending_review');
    expect(profile.rejectionReason).toBeNull();
  });

  it('suspends and reactivates an approved mentor', async () => {
    const mentor = await registerAndLogin('mentor');
    const admin = await createAdmin();
    await completeMentorOnboarding(mentor.cookie);
    await submitMentor(mentor.cookie);
    const mentorId = (await prisma.mentorProfile.findFirstOrThrow()).userId;

    await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${mentorId}/approve`)
      .set('Cookie', admin.cookie)
      .expect(200);

    const suspended = await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${mentorId}/suspend`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(suspended.body.profile.status).toBe('suspended');

    const reactivated = await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${mentorId}/reactivate`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(reactivated.body.profile.status).toBe('approved');
  });

  it('lets an approved mentor edit the profile without changing status', async () => {
    const mentor = await registerAndLogin('mentor');
    const admin = await createAdmin();
    await completeMentorOnboarding(mentor.cookie);
    await submitMentor(mentor.cookie);
    const mentorId = (await prisma.mentorProfile.findFirstOrThrow()).userId;
    await request(app.getHttpServer())
      .post(`/v1/admin/mentors/${mentorId}/approve`)
      .set('Cookie', admin.cookie)
      .expect(200);

    const response = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', mentor.cookie)
      .send({ headline: 'Ingeniera de datos' })
      .expect(200);

    expect(response.body.profile).toMatchObject({
      status: 'approved',
      headline: 'Ingeniera de datos',
    });
  });

  it('enforces roles and session authentication', async () => {
    const mentee = await registerAndLogin('mentee');
    const mentor = await registerAndLogin('mentor');

    await request(app.getHttpServer())
      .post('/v1/me/profile/submit')
      .set('Cookie', mentee.cookie)
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/admin/mentors')
      .set('Cookie', mentor.cookie)
      .expect(403);

    await request(app.getHttpServer()).get('/v1/me/profile').expect(401);
  });

  it('rejects stale onboarding versions, invalid countries and wrong sub-areas', async () => {
    const { cookie } = await registerAndLogin('mentor');

    const stale = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({ version: 2, answers: {} })
      .expect(409);
    expect(stale.body.code).toBe('ONBOARDING_VERSION_MISMATCH');

    const invalidCountry = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({ version: 1, answers: { country: 'US' } })
      .expect(400);
    expect(invalidCountry.body.code).toBe('INVALID_ONBOARDING_ANSWERS');

    const derivedAge = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({ version: 1, answers: { age: 29 } })
      .expect(400);
    expect(derivedAge.body.code).toBe('INVALID_ONBOARDING_ANSWERS');

    const invalidSubarea = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: {
          primaryAreaId: technology.id,
          areaIds: [biology.id],
        },
      })
      .expect(400);
    expect(invalidSubarea.body.code).toBe('INVALID_SUBAREA');

    const missingSubareas = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: { primaryAreaId: technology.id },
      })
      .expect(400);
    expect(missingSubareas.body.code).toBe('PRIMARY_AREA_REQUIRES_SUBAREAS');

    const emptySubareas = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({
        version: 1,
        answers: { primaryAreaId: technology.id, areaIds: [] },
      })
      .expect(400);
    expect(emptySubareas.body.code).toBe('PRIMARY_AREA_REQUIRES_SUBAREAS');
  });

  it('rejects malformed mentor ids before touching the database', async () => {
    const admin = await createAdmin();

    const response = await request(app.getHttpServer())
      .post('/v1/admin/mentors/not-a-uuid/approve')
      .set('Cookie', admin.cookie)
      .expect(400);

    expect(response.body.statusCode).toBe(400);
  });

  it('blocks mentor submission until required onboarding answers exist', async () => {
    const { cookie } = await registerAndLogin('mentor');

    await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set('Cookie', cookie)
      .send({ version: 1, answers: { city: 'Lima' } })
      .expect(200);

    const incomplete = await request(app.getHttpServer())
      .post('/v1/me/profile/submit')
      .set('Cookie', cookie)
      .expect(400);

    expect(incomplete.body.code).toBe('ONBOARDING_INCOMPLETE');
    expect(incomplete.body.details.missing).toEqual(
      expect.arrayContaining(['country', 'primaryAreaId', 'areaIds']),
    );

    await completeMentorOnboarding(cookie);
    await submitMentor(cookie);
  });

  it('rejects profile fields that do not apply to the role', async () => {
    const { cookie } = await registerAndLogin('mentee');

    const response = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', cookie)
      .send({ headline: 'No aplica' })
      .expect(400);

    expect(response.body.code).toBe('PROFILE_FIELD_NOT_ALLOWED');

    const mentor = await registerAndLogin('mentor');
    const mentorResponse = await request(app.getHttpServer())
      .put('/v1/me/profile')
      .set('Cookie', mentor.cookie)
      .send({ careerStage: 'university' })
      .expect(400);

    expect(mentorResponse.body.code).toBe('PROFILE_FIELD_NOT_ALLOWED');
  });

  it('keeps audit_log append-only', async () => {
    const mentor = await registerAndLogin('mentor');
    await completeMentorOnboarding(mentor.cookie);
    await submitMentor(mentor.cookie);

    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "audit_log" SET "action" = \'tampered\'',
      ),
    ).rejects.toThrow();
  });
});
