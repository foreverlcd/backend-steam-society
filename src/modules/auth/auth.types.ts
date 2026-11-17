import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  /** True once the user opened the verification link sent by e-mail. */
  emailVerified: boolean;
  /** True when a confirmed TOTP second factor protects the account. */
  mfaEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Password was correct; waiting for the second factor (ADR-024). */
    pendingMfa?: { userId: string; expiresAtMs: number };
    /** When this sign-in happened (epoch ms); shown in "Sesiones activas". */
    signedInAtMs?: number;
    /** Browser description at sign-in, truncated; never used for security. */
    userAgent?: string;
  }
}
