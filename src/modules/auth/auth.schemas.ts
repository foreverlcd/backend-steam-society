import { z } from 'zod';

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(12).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['mentee', 'mentor']),
  birthDate: z.iso.date(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

const totpCodeSchema = z.string().regex(/^\d{6}$/, 'must be 6 digits');
const recoveryCodeSchema = z.string().trim().min(10).max(16);

/** Exactly one of `code` (authenticator app) or `recoveryCode`. */
export const loginMfaSchema = z.union([
  z.object({ code: totpCodeSchema }).strict(),
  z.object({ recoveryCode: recoveryCodeSchema }).strict(),
]);

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

export const totpCodeBodySchema = z.object({ code: totpCodeSchema }).strict();

export const disableMfaSchema = z
  .object({ password: z.string().min(1).max(128), code: totpCodeSchema })
  .strict();

export type LoginMfaInput = z.infer<typeof loginMfaSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type TotpCodeBody = z.infer<typeof totpCodeBodySchema>;
export type DisableMfaInput = z.infer<typeof disableMfaSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
