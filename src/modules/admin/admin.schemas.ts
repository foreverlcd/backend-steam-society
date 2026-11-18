import { z } from 'zod';

export const listAdminUsersQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    role: z.enum(['mentee', 'mentor', 'admin']).optional(),
    status: z.enum(['pending_verification', 'active', 'suspended']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;

export const listAdminBookingsQuerySchema = z
  .object({
    status: z
      .enum([
        'requested',
        'awaiting_payment',
        'confirmed',
        'declined',
        'cancelled',
        'expired',
        'completed',
        'no_show',
      ])
      .optional(),
    userId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export type ListAdminBookingsQuery = z.infer<
  typeof listAdminBookingsQuerySchema
>;

export const adminCancelBookingSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type AdminCancelBookingBody = z.infer<typeof adminCancelBookingSchema>;
