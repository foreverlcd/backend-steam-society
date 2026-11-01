import { z } from 'zod';

export const recommendationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(10).optional(),
  })
  .strict();

export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;
