/**
 * Demo data for the 5-minute demo (stage 1.7). It drives the real API, so it
 * also works as a smoke test of the whole contract. Idempotent: re-running it
 * reuses existing accounts and skips what is already there.
 *
 * Requires: API running, `pnpm db:seed` done (admin + taxonomies).
 * Env: DEMO_PASSWORD (>= 12 chars), ADMIN_EMAIL, ADMIN_PASSWORD,
 *      optional DEMO_API_URL (default http://localhost:3000/v1) and
 *      DEMO_WEB_ORIGIN (default http://localhost:3001).
 * All people and emails are fictional (@demo.steamsociety.local).
 */
import 'dotenv/config';

const API = (process.env.DEMO_API_URL ?? 'http://localhost:3000/v1').replace(
  /\/+$/,
  '',
);
const ORIGIN = process.env.DEMO_WEB_ORIGIN ?? 'http://localhost:3001';
const PASSWORD = process.env.DEMO_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-demo must never run against production');
}

if (!PASSWORD || PASSWORD.length < 12) {
  throw new Error('DEMO_PASSWORD (at least 12 characters) is required');
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
}

interface MentorSeed {
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  root: string;
  children: string[];
  headline: string;
  bio: string;
  experienceRange: string;
  languages: string[];
  offerings: Array<{
    title: string;
    description: string;
    durationMinutes: number;
    isFree: boolean;
    priceMinor?: number;
  }>;
  hours: [string, string];
}

interface MenteeSeed {
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  root: string;
  children: string[];
  stage: string;
  mainGoal: string;
}

const MENTORS: MentorSeed[] = [
  {
    email: 'valeria.quispe@demo.steamsociety.local',
    firstName: 'Valeria',
    lastName: 'Quispe',
    city: 'Lima',
    root: 'Tecnología',
    children: ['Inteligencia artificial', 'Data Science / análisis de datos'],
    headline: 'Ingeniera de datos e IA aplicada',
    bio: 'Trabajo con modelos de aprendizaje automático en una fintech. Te ayudo a armar tu primer portafolio de datos y a preparar entrevistas técnicas.',
    experienceRange: '6-9',
    languages: ['es', 'en'],
    offerings: [
      {
        title: 'Primera conversación: tu ruta en datos',
        description: 'Revisamos tus intereses y armamos un plan de estudio.',
        durationMinutes: 30,
        isFree: true,
      },
      {
        title: 'Revisión de portafolio',
        description: 'Revisión detallada de tus proyectos y CV técnico.',
        durationMinutes: 60,
        isFree: false,
        priceMinor: 5000,
      },
    ],
    hours: ['18:00', '21:00'],
  },
  {
    email: 'rosa.mamani@demo.steamsociety.local',
    firstName: 'Rosa',
    lastName: 'Mamani',
    city: 'Arequipa',
    root: 'Ciencia',
    children: ['Biología', 'Investigación científica'],
    headline: 'Bióloga molecular e investigadora',
    bio: 'Investigo en biotecnología vegetal. Acompaño a estudiantes que quieren postular a becas y empezar en investigación.',
    experienceRange: '10+',
    languages: ['es', 'qu'],
    offerings: [
      {
        title: 'Becas y primeros pasos en investigación',
        description:
          'Cómo elegir laboratorio, escribir a investigadores y postular.',
        durationMinutes: 45,
        isFree: true,
      },
    ],
    hours: ['09:00', '12:00'],
  },
  {
    email: 'lucia.torres@demo.steamsociety.local',
    firstName: 'Lucía',
    lastName: 'Torres',
    city: 'Trujillo',
    root: 'Ingeniería',
    children: ['Robótica', 'Mecatrónica'],
    headline: 'Ingeniera mecatrónica en automatización',
    bio: 'Diseño celdas robóticas para la industria. Te cuento cómo es el día a día y cómo elegir tu especialidad.',
    experienceRange: '3-5',
    languages: ['es'],
    offerings: [
      {
        title: '¿Es la ingeniería para mí?',
        description: 'Conversación para decidir carrera o especialidad.',
        durationMinutes: 30,
        isFree: true,
      },
    ],
    hours: ['15:00', '18:00'],
  },
];

const MENTEES: MenteeSeed[] = [
  {
    email: 'camila.huaman@demo.steamsociety.local',
    firstName: 'Camila',
    lastName: 'Huamán',
    city: 'Lima',
    root: 'Tecnología',
    children: ['Inteligencia artificial'],
    stage: 'university',
    mainGoal: 'career_clarity',
  },
  {
    email: 'andrea.flores@demo.steamsociety.local',
    firstName: 'Andrea',
    lastName: 'Flores',
    city: 'Cusco',
    root: 'Ciencia',
    children: ['Biología'],
    stage: 'preuniversity',
    mainGoal: 'decide_career',
  },
];

class Session {
  private cookie = '';

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    allowed: number[] = [],
  ): Promise<{ status: number; data: T }> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');

    if (setCookie) {
      this.cookie = setCookie.split(';')[0];
    }

    const text = await response.text();
    const data = (text ? JSON.parse(text) : undefined) as T;

    if (!response.ok && !allowed.includes(response.status)) {
      throw new Error(
        `${method} ${path} -> ${response.status} ${JSON.stringify(data)}`,
      );
    }

    return { status: response.status, data };
  }

  async login(email: string, password: string): Promise<void> {
    await this.request('POST', '/auth/login', { email, password });
  }
}

async function signUp(
  role: 'mentor' | 'mentee',
  person: { email: string; firstName: string; lastName: string },
): Promise<Session> {
  const session = new Session();
  await session.request(
    'POST',
    '/auth/register',
    {
      email: person.email,
      password: PASSWORD,
      role,
      birthDate: role === 'mentor' ? '1990-05-12' : '2004-03-08',
      firstName: person.firstName,
      lastName: person.lastName,
    },
    [409],
  );
  await session.login(person.email, PASSWORD!);
  return session;
}

type Area = { id: string; name: string; parentId: string | null };

async function areaIds(
  session: Session,
  root: string,
  children: string[],
): Promise<{ primaryAreaId: string; areaIds: string[] }> {
  const { data } = await session.request<{ options: { areas: Area[] } }>(
    'GET',
    '/me/onboarding',
  );
  const byName = (name: string) => {
    const area = data.options.areas.find((item) => item.name === name);
    if (!area) throw new Error(`Area not found: ${name} (run pnpm db:seed)`);
    return area.id;
  };

  return { primaryAreaId: byName(root), areaIds: children.map(byName) };
}

function limaDate(offsetDays: number): string {
  const millis = Date.now() + offsetDays * 86_400_000 - 5 * 3_600_000;
  return new Date(millis).toISOString().slice(0, 10);
}

async function seedMentor(admin: Session, seed: MentorSeed): Promise<void> {
  const session = await signUp('mentor', seed);
  const areas = await areaIds(session, seed.root, seed.children);

  await session.request('PUT', '/me/onboarding', {
    version: 1,
    answers: {
      city: seed.city,
      country: 'PE',
      professionalRole: 'professional',
      experienceRange: seed.experienceRange,
      linkedinUrl: `https://www.linkedin.com/in/demo-${seed.firstName.toLowerCase()}`,
      ...areas,
      supportTypes: ['study_plan', 'portfolio'],
      industries: ['tech_saas'],
      mentoringLevels: ['beginner', 'intermediate'],
      menteeStages: ['preuniversity', 'university'],
      // Onboarding v1 takes one language; the rest go through the profile.
      languageCodes: seed.languages.slice(0, 1),
      availabilityPreferences: ['mornings', 'evenings'],
    },
  });
  await session.request('PUT', '/me/profile', {
    headline: seed.headline,
    bio: seed.bio,
    languageCodes: seed.languages,
  });

  const { data: profile } = await session.request<{
    profile: { status: string };
  }>('GET', '/me/profile');

  if (['draft', 'rejected'].includes(profile.profile.status)) {
    await session.request('POST', '/me/profile/submit');
  }

  const { data: me } = await session.request<{ id: string }>('GET', '/me');
  await admin.request(
    'POST',
    `/admin/mentors/${me.id}/approve`,
    undefined,
    [409],
  );

  await session.request('PUT', '/me/availability', {
    rules: [1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startTime: seed.hours[0],
      endTime: seed.hours[1],
      timezone: 'America/Lima',
      validFrom: limaDate(0),
      validTo: limaDate(60),
    })),
  });

  const {
    data: { items: existing },
  } = await session.request<{
    items: Array<{ title: string; archivedAt: string | null }>;
  }>('GET', '/me/offerings');

  for (const offering of seed.offerings) {
    if (
      existing.some((item) => item.title === offering.title && !item.archivedAt)
    ) {
      continue;
    }

    await session.request('POST', '/me/offerings', {
      ...offering,
      currency: 'PEN',
    });
  }

  console.log(`  mentora  ${seed.email}`);
}

async function seedMentee(seed: MenteeSeed): Promise<void> {
  const session = await signUp('mentee', seed);
  const areas = await areaIds(session, seed.root, seed.children);

  await session.request('PUT', '/me/onboarding', {
    version: 1,
    answers: {
      city: seed.city,
      country: 'PE',
      stage: seed.stage,
      ...areas,
      mainGoal: seed.mainGoal,
      supportTypes: ['study_plan'],
      industries: ['research'],
      currentLevel: 'beginner',
      languageCodes: ['es'],
      availabilityPreferences: ['mornings', 'evenings'],
    },
  });

  console.log(`  mentorada ${seed.email}`);
}

const admin = new Session();
await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);

console.log(`Sembrando datos demo en ${API}`);
for (const mentor of MENTORS) {
  await seedMentor(admin, mentor);
}
for (const mentee of MENTEES) {
  await seedMentee(mentee);
}
console.log('Listo. Contraseña de todas las cuentas demo: DEMO_PASSWORD.');
