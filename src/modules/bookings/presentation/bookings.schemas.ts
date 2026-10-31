import { z } from 'zod';
import type { BookingStatus } from '../domain/booking-status.js';

export const bookingStatusSchema = z.enum([
  'requested',
  'awaiting_payment',
  'confirmed',
  'declined',
  'cancelled',
  'expired',
  'completed',
  'no_show',
]) satisfies z.ZodType<BookingStatus>;

const reasonSchema = z.string().trim().min(1).max(500).nullable().optional();

export const createBookingSchema = z
  .object({
    offeringId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    message: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const listBookingsQuerySchema = z
  .object({
    status: bookingStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const acceptBookingSchema = z
  .object({
    meetingUrl: z.url().max(2048).optional(),
  })
  .strict();

export type AcceptBookingBody = z.infer<typeof acceptBookingSchema>;

export const declineBookingSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

export type DeclineBookingBody = z.infer<typeof declineBookingSchema>;

export const cancelBookingSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

export type CancelBookingBody = z.infer<typeof cancelBookingSchema>;
