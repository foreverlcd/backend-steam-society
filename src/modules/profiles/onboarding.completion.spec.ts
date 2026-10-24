import { getOnboardingCompletion } from './onboarding.completion.js';

const mentorAnswers = {
  city: 'Lima',
  country: 'PE',
  professionalRole: 'professional',
  experienceRange: '6-9',
  primaryAreaId: '00000000-0000-0000-0000-000000000001',
  areaIds: ['00000000-0000-0000-0000-000000000002'],
  supportTypes: ['study_plan'],
  mentoringLevels: ['beginner'],
  menteeStages: ['university'],
  languageCodes: ['es'],
  availabilityPreferences: ['mornings'],
};

const menteeAnswers = {
  city: 'Arequipa',
  country: 'PE',
  stage: 'university',
  primaryAreaId: '00000000-0000-0000-0000-000000000001',
  areaIds: ['00000000-0000-0000-0000-000000000002'],
  mainGoal: 'decide_career',
  supportTypes: ['scholarships'],
  currentLevel: 'beginner',
  languageCodes: ['es'],
  availabilityPreferences: ['afternoons'],
};

describe('getOnboardingCompletion', () => {
  it('marks a complete mentor onboarding as complete', () => {
    expect(getOnboardingCompletion('mentor', mentorAnswers)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('marks a complete mentee onboarding as complete', () => {
    expect(getOnboardingCompletion('mentee', menteeAnswers)).toEqual({
      complete: true,
      missing: [],
    });
  });

  it('does not require optional questions', () => {
    expect(
      getOnboardingCompletion('mentor', {
        ...mentorAnswers,
        industries: undefined,
        linkedinUrl: undefined,
      }).complete,
    ).toBe(true);
  });

  it('reports missing required answers', () => {
    const result = getOnboardingCompletion('mentor', {
      ...mentorAnswers,
      city: '   ',
      areaIds: [],
    });

    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['city', 'areaIds']));
  });

  it('reports missing mentee stage', () => {
    const result = getOnboardingCompletion('mentee', {
      ...menteeAnswers,
      stage: undefined,
    });

    expect(result.complete).toBe(false);
    expect(result.missing).toContain('stage');
  });

  it('ignores answers that are not part of the version', () => {
    expect(
      getOnboardingCompletion('mentor', {
        ...mentorAnswers,
        age: 29,
      }).complete,
    ).toBe(true);
  });
});
