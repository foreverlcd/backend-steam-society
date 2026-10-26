import { z } from 'zod';

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code');

const offeringFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  durationMinutes: z.number().int().min(15).max(240),
  isFree: z.boolean(),
  priceMinor: z.number().int().min(0).max(2_147_483_647).optional(),
  currency: currencySchema.optional(),
};

export const createOfferingSchema = z
  .object({
    title: offeringFields.title,
    description: offeringFields.description,
    durationMinutes: offeringFields.durationMinutes,
    isFree: offeringFields.isFree,
    priceMinor: offeringFields.priceMinor,
    currency: offeringFields.currency,
  })
  .strict();

export type CreateOfferingBody = z.infer<typeof createOfferingSchema>;

export const updateOfferingSchema = z
  .object({
    title: offeringFields.title.optional(),
    description: offeringFields.description,
    durationMinutes: offeringFields.durationMinutes.optional(),
    isFree: offeringFields.isFree.optional(),
    priceMinor: offeringFields.priceMinor,
    currency: offeringFields.currency,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateOfferingBody = z.infer<typeof updateOfferingSchema>;

export const availabilityRuleSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    timezone: z.string().trim().min(1).max(64).optional(),
    validFrom: z.iso.date().nullable().optional(),
    validTo: z.iso.date().nullable().optional(),
  })
  .strict();

export const replaceAvailabilitySchema = z
  .object({
    rules: z.array(availabilityRuleSchema).max(50),
  })
  .strict();

export type ReplaceAvailabilityBody = z.infer<typeof replaceAvailabilitySchema>;

export const slotsQuerySchema = z
  .object({
    offeringId: z.uuid(),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
