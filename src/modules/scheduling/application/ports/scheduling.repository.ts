import type { AvailabilityRule } from '../../domain/availability-rule.js';
import type { Offering, OfferingType } from '../../domain/offering.js';

export const SCHEDULING_REPOSITORY = Symbol('SCHEDULING_REPOSITORY');

export interface CreateOfferingData {
  mentorId: string;
  title: string;
  description: string | null;
  type: OfferingType;
  durationMinutes: number;
  capacity: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
}

export interface UpdateOfferingData {
  title?: string;
  description?: string | null;
  durationMinutes?: number;
  isFree?: boolean;
  priceMinor?: number;
  currency?: string;
}

export interface AvailabilityRuleData {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface SchedulingRepositoryPort {
  listOfferings(mentorId: string): Promise<Offering[]>;
  findOffering(mentorId: string, offeringId: string): Promise<Offering | null>;
  createOffering(data: CreateOfferingData): Promise<Offering>;
  updateOffering(
    mentorId: string,
    offeringId: string,
    data: UpdateOfferingData,
  ): Promise<Offering | null>;
  archiveOffering(
    mentorId: string,
    offeringId: string,
    archivedAt: Date,
  ): Promise<Offering | null>;
  listAvailabilityRules(userId: string): Promise<AvailabilityRule[]>;
  replaceAvailabilityRules(
    userId: string,
    rules: AvailabilityRuleData[],
  ): Promise<AvailabilityRule[]>;
  findPublicOffering(
    mentorId: string,
    offeringId: string,
  ): Promise<Offering | null>;
  findOfferingById(offeringId: string): Promise<Offering | null>;
}
