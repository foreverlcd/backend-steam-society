import {
  getOnboardingConfig,
  type OnboardingRole,
} from './onboarding.config.js';

export interface OnboardingCompletion {
  complete: boolean;
  missing: string[];
}

export function getOnboardingCompletion(
  role: OnboardingRole,
  answers: Record<string, unknown>,
): OnboardingCompletion {
  const missing = getOnboardingConfig(role)
    .steps.flatMap((step) => step.questions)
    .filter((question) => question.required && !isAnswered(answers[question.code]))
    .map((question) => question.code);

  return { complete: missing.length === 0, missing };
}

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}
