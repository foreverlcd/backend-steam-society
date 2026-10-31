import { z } from 'zod';

const envSchema = z.object({
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
});

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
