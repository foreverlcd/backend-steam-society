import { DEFAULT_MATCHING_CONFIG } from './matching.config.js';
import { recommend } from './recommend.js';
import type {
  MatchingArea,
  MatchingConfig,
  MenteeSignals,
  MentorCandidate,
} from './matching.types.js';

const TECHNOLOGY: MatchingArea = {
  id: 'area-technology',
  name: 'Tecnología',
  parentId: null,
};
const AI: MatchingArea = {
  id: 'area-ai',
  name: 'Inteligencia artificial',
  parentId: TECHNOLOGY.id,
};
const MATH: MatchingArea = {
  id: 'area-math',
  name: 'Matemáticas',
  parentId: null,
};

const CONFIG: MatchingConfig = {
  ...DEFAULT_MATCHING_CONFIG,
  targetAvailabilityHours: 3,
};

function mentee(overrides: Partial<MenteeSignals> = {}): MenteeSignals {
  return {
    userId: 'mentee-1',
    timezone: 'America/Lima',
    areas: [AI],
    languages: [{ code: 'es', name: 'Español' }],
    careerStage: 'university',
    currentLevel: null,
    availabilityPreferences: ['mornings'],
    onlyFree: null,
    maxPriceMinor: null,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<MentorCandidate> = {},
): MentorCandidate {
  return {
    userId: 'mentor-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Ingeniera de software',
    bio: 'Mentora de IA',
    yearsExperience: 6,
    country: 'PE',
    city: 'Lima',
    status: 'approved',
    userStatus: 'active',
    areas: [AI],
    languages: [{ code: 'es', name: 'Español' }],
    offerings: [
      {
        id: 'offering-1',
        title: 'Mentoría gratuita',
        isFree: true,
        priceMinor: 0,
        currency: 'PEN',
        durationMinutes: 60,
      },
    ],
    availability: [
      {
        startsAt: new Date('2026-10-26T14:00:00.000Z'),
        endsAt: new Date('2026-10-26T17:00:00.000Z'),
        timezone: 'America/Lima',
      },
    ],
    ...overrides,
  };
}

describe('recommend', () => {
  it('scores a fully compatible candidate and explains the top signals', () => {
    const [result] = recommend({
      mentee: mentee(),
      candidates: [candidate()],
      config: CONFIG,
    });

    expect(result).toMatchObject({
      mentorId: 'mentor-1',
      score: 97.5,
      reason:
        'Comparte tu interés en Inteligencia artificial y tiene horarios que coinciden con tu disponibilidad.',
    });
    expect(result.breakdown).toEqual([
      {
        signal: 'areas',
        points: 35,
        max: 35,
        detail: '1 de 1 intereses en común: Inteligencia artificial.',
      },
      {
        signal: 'availability',
        points: 20,
        max: 20,
        detail: '3 h de coincidencia en los próximos 14 días.',
      },
      {
        signal: 'language',
        points: 15,
        max: 15,
        detail: '1 de 1 idiomas en común: Español.',
      },
      {
        signal: 'level_fit',
        points: 15,
        max: 15,
        detail: '6 años de experiencia; tu perfil sugiere ~6 años.',
      },
      {
        signal: 'price_fit',
        points: 10,
        max: 10,
        detail: 'Ofrece una mentoría gratuita.',
      },
      {
        signal: 'reliability',
        points: 2.5,
        max: 5,
        detail: 'Sin datos de confiabilidad todavía; valor neutral.',
      },
    ]);
  });

  it('filters out candidates that fail any hard filter', () => {
    const blocked = mentee({
      onlyFree: true,
      blockedMentorIds: ['blocked'],
    });
    const cases: MentorCandidate[] = [
      candidate({ userId: 'pending', status: 'pending_review' }),
      candidate({ userId: 'suspended-user', userStatus: 'suspended' }),
      candidate({ userId: 'no-language', languages: [] }),
      candidate({ userId: 'no-area', areas: [MATH] }),
      candidate({ userId: 'no-slots', availability: [] }),
      candidate({
        userId: 'paid-only',
        offerings: [
          {
            id: 'offering-paid',
            title: 'Mentoría de pago',
            isFree: false,
            priceMinor: 5000,
            currency: 'PEN',
            durationMinutes: 60,
          },
        ],
      }),
      candidate({ userId: 'blocked' }),
    ];

    const results = recommend({
      mentee: blocked,
      candidates: cases,
      config: CONFIG,
    });

    expect(results).toEqual([]);
  });

  it('accepts a paid candidate when onlyFree is not requested', () => {
    const paid = candidate({
      offerings: [
        {
          id: 'offering-paid',
          title: 'Mentoría de pago',
          isFree: false,
          priceMinor: 5000,
          currency: 'PEN',
          durationMinutes: 60,
        },
      ],
    });
    const [result] = recommend({
      mentee: mentee(),
      candidates: [paid],
      config: CONFIG,
    });

    expect(result.breakdown).toContainEqual({
      signal: 'price_fit',
      points: 5,
      max: 10,
      detail: 'Solo ofrece mentorías de pago; no declaraste presupuesto.',
    });
  });

  it('enforces onlyFree and the maximum budget', () => {
    const paid = candidate({
      userId: 'paid',
      offerings: [
        {
          id: 'offering-paid',
          title: 'Mentoría de pago',
          isFree: false,
          priceMinor: 5000,
          currency: 'PEN',
          durationMinutes: 60,
        },
      ],
    });

    expect(
      recommend({
        mentee: mentee({ onlyFree: true }),
        candidates: [paid],
        config: CONFIG,
      }),
    ).toEqual([]);
    expect(
      recommend({
        mentee: mentee({ maxPriceMinor: 4000 }),
        candidates: [paid],
        config: CONFIG,
      }),
    ).toEqual([]);
  });

  it('treats a parent-child area as a partial match in both directions', () => {
    const menteeWithParent = mentee({ areas: [TECHNOLOGY] });
    const candidateWithChild = candidate({ areas: [AI] });
    const menteeWithChild = mentee({ areas: [AI] });
    const candidateWithParent = candidate({ areas: [TECHNOLOGY] });

    const [childResult] = recommend({
      mentee: menteeWithParent,
      candidates: [candidateWithChild],
      config: CONFIG,
    });
    const [parentResult] = recommend({
      mentee: menteeWithChild,
      candidates: [candidateWithParent],
      config: CONFIG,
    });

    expect(childResult.breakdown[0]).toMatchObject({
      signal: 'areas',
      points: 17.5,
    });
    expect(childResult.reason).toBe(
      'Tiene horarios que coinciden con tu disponibilidad y comparte tu interés en Tecnología.',
    );
    expect(parentResult.breakdown[0]).toMatchObject({
      signal: 'areas',
      points: 17.5,
    });
    expect(parentResult.reason).toBe(
      'Tiene horarios que coinciden con tu disponibilidad y comparte tu interés en Inteligencia artificial.',
    );
  });

  it('gives neutral points when the mentee has no signals', () => {
    const [result] = recommend({
      mentee: mentee({
        areas: [],
        languages: [],
        careerStage: null,
        currentLevel: null,
        availabilityPreferences: [],
      }),
      candidates: [candidate()],
      config: CONFIG,
    });

    expect(result.score).toBe(30);
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: 'areas', points: 0 }),
        expect.objectContaining({ signal: 'availability', points: 10 }),
        expect.objectContaining({ signal: 'language', points: 0 }),
        expect.objectContaining({ signal: 'level_fit', points: 7.5 }),
      ]),
    );
    expect(result.reason).toBe('Ofrece una mentoría gratuita.');
  });

  it('ranks by score and breaks ties by mentor id', () => {
    const second = candidate({
      userId: 'mentor-b',
      areas: [TECHNOLOGY],
    });
    const first = candidate({ userId: 'mentor-a' });

    const results = recommend({
      mentee: mentee(),
      candidates: [second, first],
      config: CONFIG,
    });

    expect(results.map((result) => result.mentorId)).toEqual([
      'mentor-a',
      'mentor-b',
    ]);
  });

  it('changes the order when the weights change', () => {
    const areaHeavy = candidate({ userId: 'area-heavy' });
    const languageHeavy = candidate({
      userId: 'language-heavy',
      areas: [TECHNOLOGY],
      languages: [
        { code: 'es', name: 'Español' },
        { code: 'en', name: 'Inglés' },
        { code: 'qu', name: 'Quechua' },
      ],
    });
    const menteeWithLanguages = mentee({
      languages: [
        { code: 'es', name: 'Español' },
        { code: 'en', name: 'Inglés' },
        { code: 'qu', name: 'Quechua' },
      ],
    });

    const defaultOrder = recommend({
      mentee: menteeWithLanguages,
      candidates: [areaHeavy, languageHeavy],
      config: CONFIG,
    });
    const languageFirst = recommend({
      mentee: menteeWithLanguages,
      candidates: [areaHeavy, languageHeavy],
      config: {
        ...CONFIG,
        weights: { ...CONFIG.weights, areas: 5, language: 50 },
      },
    });

    expect(defaultOrder.map((result) => result.mentorId)).toEqual([
      'area-heavy',
      'language-heavy',
    ]);
    expect(languageFirst.map((result) => result.mentorId)).toEqual([
      'language-heavy',
      'area-heavy',
    ]);
  });

  it('keeps every score between 0 and 100', () => {
    const results = recommend({
      mentee: mentee({
        languages: [
          { code: 'es', name: 'Español' },
          { code: 'en', name: 'Inglés' },
        ],
        availabilityPreferences: ['mornings', 'afternoons', 'evenings', 'weekends'],
      }),
      candidates: [
        candidate({ userId: 'one' }),
        candidate({
          userId: 'two',
          yearsExperience: 30,
          areas: [TECHNOLOGY],
          languages: [{ code: 'en', name: 'Inglés' }],
        }),
      ],
      config: CONFIG,
    });

    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
