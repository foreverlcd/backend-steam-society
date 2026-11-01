import { z } from 'zod';
import {
  AVAILABILITY_PREFERENCES,
  COUNTRY_CODES,
  CURRENT_LEVELS,
  EXPERIENCE_RANGES,
  INDUSTRIES,
  MAIN_GOALS,
  MENTEE_STAGES,
  MENTORING_LEVELS,
  PROFESSIONAL_ROLES,
  SUPPORT_TYPES,
} from './onboarding.config.js';

const languageCodeSchema = z.string().regex(/^[a-z]{2}$/);

const mentorAnswersSchema = z
  .object({
    city: z.string().trim().min(1).max(100).optional(),
    country: z.enum(COUNTRY_CODES).optional(),
    professionalRole: z.enum(PROFESSIONAL_ROLES).optional(),
    experienceRange: z.enum(EXPERIENCE_RANGES).optional(),
    linkedinUrl: z.url().max(255).optional(),
    primaryAreaId: z.uuid().optional(),
    areaIds: z.array(z.uuid()).max(5).optional(),
    supportTypes: z.array(z.enum(SUPPORT_TYPES)).max(5).optional(),
    industries: z.array(z.enum(INDUSTRIES)).max(3).optional(),
    mentoringLevels: z.array(z.enum(MENTORING_LEVELS)).optional(),
    menteeStages: z.array(z.enum(MENTEE_STAGES)).optional(),
    languageCodes: z.array(languageCodeSchema).min(1).max(1).optional(),
    availabilityPreferences: z
      .array(z.enum(AVAILABILITY_PREFERENCES))
      .max(2)
      .optional(),
  })
  .strict();

const menteeAnswersSchema = z
  .object({
    city: z.string().trim().min(1).max(100).optional(),
    country: z.enum(COUNTRY_CODES).optional(),
    stage: z.enum(MENTEE_STAGES).optional(),
    primaryAreaId: z.uuid().optional(),
    areaIds: z.array(z.uuid()).max(3).optional(),
    mainGoal: z.enum(MAIN_GOALS).optional(),
    supportTypes: z.array(z.enum(SUPPORT_TYPES)).max(3).optional(),
    industries: z.array(z.enum(INDUSTRIES)).max(3).optional(),
    currentLevel: z.enum(CURRENT_LEVELS).optional(),
    languageCodes: z.array(languageCodeSchema).min(1).max(1).optional(),
    availabilityPreferences: z
      .array(z.enum(AVAILABILITY_PREFERENCES))
      .max(2)
      .optional(),
  })
  .strict();

export type MentorAnswers = z.infer<typeof mentorAnswersSchema>;
export type MenteeAnswers = z.infer<typeof menteeAnswersSchema>;

export function getOnboardingAnswerKeys(role: 'mentor' | 'mentee'): string[] {
  const schema = role === 'mentor' ? mentorAnswersSchema : menteeAnswersSchema;

  return Object.keys(schema.shape);
}

export function parseOnboardingAnswers(
  role: 'mentor' | 'mentee',
  answers: unknown,
): MentorAnswers | MenteeAnswers {
  return role === 'mentor'
    ? mentorAnswersSchema.parse(answers)
    : menteeAnswersSchema.parse(answers);
}

export const onboardingUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    answers: z.record(z.string(), z.unknown()),
  })
  .strict();

export type OnboardingUpdateInput = z.infer<typeof onboardingUpdateSchema>;

const profileBaseSchema = {
  country: z.enum(COUNTRY_CODES).nullable().optional(),
  city: z.string().trim().min(1).max(100).nullable().optional(),
  languageCodes: z.array(languageCodeSchema).min(1).max(10).optional(),
};

export const mentorProfileUpdateSchema = z
  .object({
    ...profileBaseSchema,
    headline: z.string().trim().min(1).max(160).nullable().optional(),
    bio: z.string().trim().max(4000).nullable().optional(),
    yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
    areaIds: z.array(z.uuid()).max(5).optional(),
  })
  .strict();

export const menteeProfileUpdateSchema = z
  .object({
    ...profileBaseSchema,
    goals: z.string().trim().max(2000).nullable().optional(),
    educationLevel: z
      .enum(['school', 'undergraduate', 'graduate', 'career_change', 'other'])
      .nullable()
      .optional(),
    careerStage: z.enum(MENTEE_STAGES).nullable().optional(),
    areaIds: z.array(z.uuid()).max(3).optional(),
  })
  .strict();

export const updateProfileSchema = z.union([
  mentorProfileUpdateSchema,
  menteeProfileUpdateSchema,
]);

export type MentorProfileUpdateInput = z.infer<
  typeof mentorProfileUpdateSchema
>;
export type MenteeProfileUpdateInput = z.infer<
  typeof menteeProfileUpdateSchema
>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const listMentorsQuerySchema = z
  .object({
    status: z
      .enum(['draft', 'pending_review', 'approved', 'rejected', 'suspended'])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();

export type ListMentorsQuery = z.infer<typeof listMentorsQuerySchema>;

export const publicMentorQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    areaId: z.uuid().optional(),
    language: z
      .string()
      .regex(/^[a-z]{2}$/, 'Expected an ISO 639-1 code')
      .optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code')
      .optional(),
    isFree: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    maxPriceMinor: z.coerce
      .number()
      .int()
      .min(0)
      .max(2_147_483_647)
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code')
      .default('PEN'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(500).optional(),
  })
  .strict();

export type PublicMentorQuery = z.infer<typeof publicMentorQuerySchema>;

export const rejectMentorSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type RejectMentorInput = z.infer<typeof rejectMentorSchema>;
