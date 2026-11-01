import type {
  MatchingArea,
  MatchingLanguage,
  MenteeSignals,
  MentorAvailabilitySlot,
  MentorCandidate,
  MentorOffering,
} from '../../src/modules/matching/domain/matching.types.js';

export const EVAL_AREAS = {
  ai: {
    id: 'area-ai',
    name: 'Inteligencia artificial',
    parentId: 'area-technology',
  },
  programming: {
    id: 'area-programming',
    name: 'Programación',
    parentId: 'area-technology',
  },
  biology: {
    id: 'area-biology',
    name: 'Biología',
    parentId: 'area-science',
  },
  robotics: {
    id: 'area-robotics',
    name: 'Robótica',
    parentId: 'area-engineering',
  },
  statistics: {
    id: 'area-statistics',
    name: 'Estadística',
    parentId: 'area-math',
  },
} satisfies Record<string, MatchingArea>;

export const EVAL_LANGUAGES = {
  es: { code: 'es', name: 'Español' },
  en: { code: 'en', name: 'Inglés' },
} satisfies Record<string, MatchingLanguage>;

export interface EvalMentor {
  id: string;
  area: MatchingArea;
  language: MatchingLanguage;
  yearsExperience: number;
  isFree: boolean;
}

export interface EvalMentee {
  id: string;
  area: MatchingArea;
  language: MatchingLanguage;
  expectedTop3: string[];
}

const SLOT: MentorAvailabilitySlot = {
  startsAt: new Date('2026-11-02T14:00:00.000Z'),
  endsAt: new Date('2026-11-02T17:00:00.000Z'),
  timezone: 'America/Lima',
};

// Ten clusters (five areas × two languages) with three mentors each. The
// expected top-3 is hand-written: the only mentors that pass the hard filters
// for a mentee are the three in her cluster.
export const EVAL_MENTORS: EvalMentor[] = [
  { id: 'm01', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.es, yearsExperience: 3, isFree: true },
  { id: 'm02', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.es, yearsExperience: 6, isFree: true },
  { id: 'm03', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.es, yearsExperience: 10, isFree: true },
  { id: 'm04', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.en, yearsExperience: 3, isFree: true },
  { id: 'm05', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.en, yearsExperience: 6, isFree: true },
  { id: 'm06', area: EVAL_AREAS.ai, language: EVAL_LANGUAGES.en, yearsExperience: 10, isFree: true },
  { id: 'm07', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.es, yearsExperience: 3, isFree: true },
  { id: 'm08', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.es, yearsExperience: 6, isFree: true },
  { id: 'm09', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.es, yearsExperience: 10, isFree: true },
  { id: 'm10', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.en, yearsExperience: 3, isFree: true },
  { id: 'm11', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.en, yearsExperience: 6, isFree: true },
  { id: 'm12', area: EVAL_AREAS.programming, language: EVAL_LANGUAGES.en, yearsExperience: 10, isFree: true },
  { id: 'm13', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.es, yearsExperience: 3, isFree: true },
  { id: 'm14', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.es, yearsExperience: 6, isFree: true },
  { id: 'm15', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.es, yearsExperience: 10, isFree: true },
  { id: 'm16', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.en, yearsExperience: 3, isFree: true },
  { id: 'm17', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.en, yearsExperience: 6, isFree: true },
  { id: 'm18', area: EVAL_AREAS.biology, language: EVAL_LANGUAGES.en, yearsExperience: 10, isFree: true },
  { id: 'm19', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.es, yearsExperience: 3, isFree: true },
  { id: 'm20', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.es, yearsExperience: 6, isFree: true },
  { id: 'm21', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.es, yearsExperience: 10, isFree: true },
  { id: 'm22', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.en, yearsExperience: 3, isFree: true },
  { id: 'm23', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.en, yearsExperience: 6, isFree: true },
  { id: 'm24', area: EVAL_AREAS.robotics, language: EVAL_LANGUAGES.en, yearsExperience: 10, isFree: true },
  { id: 'm25', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.es, yearsExperience: 3, isFree: true },
  { id: 'm26', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.es, yearsExperience: 6, isFree: true },
  { id: 'm27', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.es, yearsExperience: 10, isFree: true },
  { id: 'm28', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.en, yearsExperience: 3, isFree: true },
  { id: 'm29', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.en, yearsExperience: 6, isFree: true },
  { id: 'm30', area: EVAL_AREAS.statistics, language: EVAL_LANGUAGES.en, yearsExperience: 10, isFree: true },
];

function menteePair(
  prefix: string,
  area: MatchingArea,
  language: MatchingLanguage,
  expectedTop3: string[],
): EvalMentee[] {
  return [`${prefix}a`, `${prefix}b`].map((id) => ({
    id,
    area,
    language,
    expectedTop3,
  }));
}

export const EVAL_MENTEES: EvalMentee[] = [
  ...menteePair('q01', EVAL_AREAS.ai, EVAL_LANGUAGES.es, ['m01', 'm02', 'm03']),
  ...menteePair('q02', EVAL_AREAS.ai, EVAL_LANGUAGES.en, ['m04', 'm05', 'm06']),
  ...menteePair('q03', EVAL_AREAS.programming, EVAL_LANGUAGES.es, ['m07', 'm08', 'm09']),
  ...menteePair('q04', EVAL_AREAS.programming, EVAL_LANGUAGES.en, ['m10', 'm11', 'm12']),
  ...menteePair('q05', EVAL_AREAS.biology, EVAL_LANGUAGES.es, ['m13', 'm14', 'm15']),
  ...menteePair('q06', EVAL_AREAS.biology, EVAL_LANGUAGES.en, ['m16', 'm17', 'm18']),
  ...menteePair('q07', EVAL_AREAS.robotics, EVAL_LANGUAGES.es, ['m19', 'm20', 'm21']),
  ...menteePair('q08', EVAL_AREAS.robotics, EVAL_LANGUAGES.en, ['m22', 'm23', 'm24']),
  ...menteePair('q09', EVAL_AREAS.statistics, EVAL_LANGUAGES.es, ['m25', 'm26', 'm27']),
  ...menteePair('q10', EVAL_AREAS.statistics, EVAL_LANGUAGES.en, ['m28', 'm29', 'm30']),
];

export function toEvalMentee(mentee: EvalMentee): MenteeSignals {
  return {
    userId: mentee.id,
    timezone: 'America/Lima',
    areas: [mentee.area],
    languages: [mentee.language],
    careerStage: 'university',
    currentLevel: 'beginner',
    availabilityPreferences: ['mornings'],
    onlyFree: null,
    maxPriceMinor: null,
  };
}

export function toEvalCandidate(mentor: EvalMentor): MentorCandidate {
  const offering: MentorOffering = {
    id: `offering-${mentor.id}`,
    title: 'Mentoría',
    isFree: mentor.isFree,
    priceMinor: mentor.isFree ? 0 : 5000,
    currency: 'PEN',
    durationMinutes: 60,
  };

  return {
    userId: mentor.id,
    firstName: mentor.id,
    lastName: 'Mentora',
    headline: `Mentora de ${mentor.area.name}`,
    bio: null,
    yearsExperience: mentor.yearsExperience,
    country: 'PE',
    city: 'Lima',
    status: 'approved',
    userStatus: 'active',
    areas: [mentor.area],
    languages: [mentor.language],
    offerings: [offering],
    availability: [SLOT],
  };
}
