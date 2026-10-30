import type { MentorStatus } from '../../profiles/domain/mentor-status.js';

export interface AvailabilityRule {
  id: string;
  userId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: string | null;
  validTo: string | null;
  createdAt: Date;
}

export type AccountStatus =
  'pending_verification' | 'active' | 'suspended' | 'deleted';

export interface MentorSettings {
  status: MentorStatus;
  userStatus: AccountStatus;
  minNoticeHours: number;
  maxAdvanceDays: number;
  timezone: string;
}
