import {
  getOnboardingConfig,
  getOnboardingQuestionCodes,
  ONBOARDING_VERSION,
  type OnboardingRole,
} from './onboarding.config.js';
import {
  getOnboardingAnswerKeys,
  parseOnboardingAnswers,
} from './profiles.schemas.js';

describe('onboarding config', () => {
  it('uses version 1 for both roles', () => {
    expect(ONBOARDING_VERSION).toBe(1);
    expect(getOnboardingConfig('mentor').version).toBe(1);
    expect(getOnboardingConfig('mentee').version).toBe(1);
  });

  it.each<OnboardingRole>(['mentor', 'mentee'])(
    'keeps question codes unique for %s',
    (role) => {
      const codes = getOnboardingConfig(role).steps.flatMap((step) =>
        step.questions.map((question) => question.code),
      );

      expect(new Set(codes).size).toBe(codes.length);
    },
  );

  it('requires a primary area and sub-areas for mentor and mentee', () => {
    for (const role of ['mentor', 'mentee'] as const) {
      const codes = getOnboardingConfig(role).steps.flatMap((step) =>
        step.questions.map((question) => question.code),
      );

      expect(codes).toContain('primaryAreaId');
      expect(codes).toContain('areaIds');
    }
  });

  it.each<OnboardingRole>(['mentor', 'mentee'])(
    'keeps the %s config and answer schema in sync',
    (role) => {
      expect(getOnboardingQuestionCodes(role).sort()).toEqual(
        getOnboardingAnswerKeys(role).sort(),
      );
    },
  );
});

describe('parseOnboardingAnswers', () => {
  it('accepts valid mentor answers and rejects unknown fields', () => {
    const valid = {
      city: 'Lima',
      country: 'PE',
      experienceRange: '6-9',
      areaIds: [],
    };

    expect(parseOnboardingAnswers('mentor', valid)).toEqual(valid);
    expect(() =>
      parseOnboardingAnswers('mentor', { ...valid, unknown: true }),
    ).toThrow();
  });

  it('rejects too many mentee sub-areas', () => {
    expect(() =>
      parseOnboardingAnswers('mentee', {
        areaIds: [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000004',
        ],
      }),
    ).toThrow();
  });

  it('rejects a country outside the initial market list', () => {
    expect(() => parseOnboardingAnswers('mentee', { country: 'US' })).toThrow();
  });
});
