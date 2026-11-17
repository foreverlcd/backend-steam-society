import { SetMetadata } from '@nestjs/common';

export const REQUIRES_VERIFIED_EMAIL_KEY = 'requiresVerifiedEmail';
export const ALLOWED_WITHOUT_MFA_KEY = 'allowedWithoutMfa';

/**
 * The signed-in user must have confirmed their e-mail (ADR-024). Use it on
 * actions that reach another person: booking a session, submitting a mentor
 * profile for review.
 */
export const RequireVerifiedEmail = () =>
  SetMetadata(REQUIRES_VERIFIED_EMAIL_KEY, true);

/**
 * Reachable by a role that must use 2FA but has not enrolled yet: the routes
 * needed to enroll, read the session and sign out.
 */
export const AllowWithoutMfa = () => SetMetadata(ALLOWED_WITHOUT_MFA_KEY, true);
