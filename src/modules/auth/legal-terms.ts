/**
 * Version of the terms of use and privacy notice the sign-up form shows.
 * Stored on the user at registration. Texts are drafts pending legal review
 * (DA-01, DA-04): bump this when the accepted texts change.
 */
export const LEGAL_TERMS_VERSION = '2026-11-18';

/**
 * Below this age, personal data needs parent/guardian consent
 * (Peru, Ley 29733 and its 2024 regulation).
 */
export const GUARDIAN_CONSENT_MIN_AGE = 14;

/** How long the parent/guardian consent link stays valid. */
export const GUARDIAN_CONSENT_TOKEN_TTL_DAYS = 7;

/** Completed years at `now`, both read as UTC calendar dates. */
export function ageInYears(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}
