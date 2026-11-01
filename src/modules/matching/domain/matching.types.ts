export type MatchingSignal =
  | 'areas'
  | 'availability'
  | 'language'
  | 'level_fit'
  | 'price_fit'
  | 'reliability';

export type MatchingCareerStage =
  | 'school'
  | 'preuniversity'
  | 'university'
  | 'early_career';

export type MatchingCurrentLevel = 'beginner' | 'intermediate' | 'advanced';

export type MatchingAvailabilityPreference =
  | 'mornings'
  | 'afternoons'
  | 'evenings'
  | 'weekends';

export interface MatchingArea {
  id: string;
  name: string;
  parentId: string | null;
}

export interface MatchingLanguage {
  code: string;
  name: string;
}

export interface MenteeSignals {
  userId: string;
  timezone: string;
  areas: MatchingArea[];
  languages: MatchingLanguage[];
  careerStage: MatchingCareerStage | null;
  currentLevel: MatchingCurrentLevel | null;
  availabilityPreferences: MatchingAvailabilityPreference[];
  onlyFree: boolean | null;
  maxPriceMinor: number | null;
  blockedMentorIds?: string[];
}

export interface MentorOffering {
  id: string;
  title: string;
  isFree: boolean;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
}

export interface MentorAvailabilitySlot {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

export interface MentorCandidate {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number | null;
  country: string | null;
  city: string | null;
  status:
    | 'draft'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'suspended';
  userStatus:
    | 'pending_verification'
    | 'active'
    | 'suspended'
    | 'deleted';
  areas: MatchingArea[];
  languages: MatchingLanguage[];
  offerings: MentorOffering[];
  availability: MentorAvailabilitySlot[];
}

export interface MatchingWeights {
  areas: number;
  availability: number;
  language: number;
  level_fit: number;
  price_fit: number;
  reliability: number;
}

export interface MatchingConfig {
  weights: MatchingWeights;
  horizonDays: number;
  targetAvailabilityHours: number;
  reliabilityNeutral: number;
  defaultLimit: number;
  maxLimit: number;
  levelFitMaxYearsDistance: number;
}

export interface ScoreBreakdown {
  signal: MatchingSignal;
  points: number;
  max: number;
  detail: string;
}

export interface MentorRecommendation {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number | null;
  country: string | null;
  city: string | null;
  areas: MatchingArea[];
  languages: MatchingLanguage[];
  offerings: MentorOffering[];
}

export interface Recommendation {
  mentorId: string;
  mentor: MentorRecommendation;
  score: number;
  breakdown: ScoreBreakdown[];
  reason: string;
}

export interface RecommendInput {
  mentee: MenteeSignals;
  candidates: MentorCandidate[];
  config: MatchingConfig;
}

export interface CandidateScore {
  candidate: MentorCandidate;
  score: number;
  breakdown: ScoreBreakdown[];
  reason: string;
}
