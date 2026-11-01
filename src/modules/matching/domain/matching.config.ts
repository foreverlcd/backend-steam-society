import type { MatchingConfig } from './matching.types.js';

export const MATCHING_CONFIG = Symbol('MATCHING_CONFIG');

// Provisional weights from docs/08-MATCHING.md. Changing them is configuration,
// not a code change; the evaluation script reports precision@3 for every change.
export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  weights: {
    areas: 35,
    availability: 20,
    language: 15,
    level_fit: 15,
    price_fit: 10,
    reliability: 5,
  },
  horizonDays: 14,
  targetAvailabilityHours: 6,
  reliabilityNeutral: 0.5,
  defaultLimit: 3,
  maxLimit: 10,
  levelFitMaxYearsDistance: 7,
};
