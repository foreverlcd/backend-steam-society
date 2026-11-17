import { z } from 'zod';

/** The user types ELIMINAR on purpose, besides the password (and 2FA code). */
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(128),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    confirmation: z.literal('ELIMINAR'),
  })
  .strict();

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
