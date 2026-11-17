import { z } from 'zod';

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
    WEB_ORIGIN: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    SMTP_URL: z.url().optional(),
    APP_URL: z.url().default('http://localhost:3001'),
    BOOKING_REQUEST_TTL_HOURS: z.coerce.number().int().positive().default(48),
    SMTP_FROM: z
      .string()
      .min(1)
      .default('Steam Society <no-reply@steamsociety.local>'),
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
    NODE_ENV: z.string().optional(),
    // Payments are pluggable: `disabled` (pilot default) or `fake` (dev only).
    PAYMENTS_PROVIDER: z.enum(['disabled', 'fake']).default('disabled'),
    // Platform fee in basis points; 1500 = 15 % (F0 provisional default).
    PAYMENTS_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
    // Only for local load tests (k6 from a single IP); refused in production.
    THROTTLE_DISABLED: z.enum(['true', 'false']).default('false'),
    // 32 random bytes in base64 that encrypt TOTP secrets at rest. Required in
    // production; in development it is derived from SESSION_SECRET.
    MFA_ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'must be 32 bytes encoded in base64',
      })
      .optional(),
    // Lifetime of the e-mail verification link.
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(48),
    // "hibp": reject passwords found in known breaches (Have I Been Pwned,
    // k-anonymity: only 5 hex chars of the SHA-1 leave the server). "off": skip.
    PASSWORD_BREACH_CHECK: z.enum(['off', 'hibp']).default('off'),
  })
  .refine(
    (env) =>
      !(env.NODE_ENV === 'production' && env.PAYMENTS_PROVIDER === 'fake'),
    {
      path: ['PAYMENTS_PROVIDER'],
      message: 'the fake payment provider is not allowed in production',
    },
  )
  .refine(
    (env) => !(env.NODE_ENV === 'production' && !env.MFA_ENCRYPTION_KEY),
    {
      path: ['MFA_ENCRYPTION_KEY'],
      message: 'is required in production',
    },
  )
  .refine(
    (env) =>
      !(env.NODE_ENV === 'production' && env.THROTTLE_DISABLED === 'true'),
    {
      path: ['THROTTLE_DISABLED'],
      message: 'rate limiting cannot be disabled in production',
    },
  );

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return parsed.data;
}
