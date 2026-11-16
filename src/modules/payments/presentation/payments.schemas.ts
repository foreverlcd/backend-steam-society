import { z } from 'zod';

export const startCheckoutSchema = z
  .object({
    bookingId: z.uuid(),
  })
  .strict();

export type StartCheckoutBody = z.infer<typeof startCheckoutSchema>;

export const providerParamSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/);
