export interface CreateOfferingInput {
  title: string;
  description?: string | null;
  durationMinutes: number;
  isFree: boolean;
  priceMinor?: number;
  currency?: string;
}

export interface UpdateOfferingInput {
  title?: string;
  description?: string | null;
  durationMinutes?: number;
  isFree?: boolean;
  priceMinor?: number;
  currency?: string;
}

export interface AvailabilityRuleInput {
  weekday: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface ReplaceAvailabilityInput {
  rules: AvailabilityRuleInput[];
}

export interface SlotsQueryInput {
  offeringId: string;
  from: string;
  to: string;
}
