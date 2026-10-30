export type OfferingType = 'one_to_one' | 'group';

export interface Offering {
  id: string;
  mentorId: string;
  title: string;
  description: string | null;
  type: OfferingType;
  durationMinutes: number;
  capacity: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
