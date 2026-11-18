import { z } from 'zod';

export const REPORT_REASONS = [
  'harassment',
  'inappropriate_content',
  'spam_or_fraud',
  'safety_concern',
  'no_show',
  'other',
] as const;

export const blockUserSchema = z.object({ userId: z.uuid() }).strict();
export type BlockUserBody = z.infer<typeof blockUserSchema>;

export const createReportSchema = z
  .object({
    reportedUserId: z.uuid(),
    bookingId: z.uuid().optional(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type CreateReportBody = z.infer<typeof createReportSchema>;

export const listReportsQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved', 'dismissed']).default('open'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const resolveReportSchema = z
  .object({
    action: z.enum(['dismiss', 'warn', 'suspend']),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();
export type ResolveReportBody = z.infer<typeof resolveReportSchema>;

export const suspendUserSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type SuspendUserBody = z.infer<typeof suspendUserSchema>;
