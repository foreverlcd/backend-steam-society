import type { BookingStatus } from './booking-status.js';

export type SessionStatus = 'open' | 'cancelled' | 'completed';
export type CancelActor = 'mentee' | 'mentor' | 'admin' | 'system';
export type NoShowParty = 'mentee' | 'mentor';

export interface BookingSession {
  id: string;
  offeringId: string;
  mentorId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  status: SessionStatus;
  meetingUrl: string | null;
}

export interface BookingParticipant {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  timezone: string;
}

export interface BookingOffering {
  id: string;
  title: string;
  durationMinutes: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
}

export interface Booking {
  id: string;
  sessionId: string;
  menteeId: string;
  status: BookingStatus;
  message: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: CancelActor | null;
  cancelReason: string | null;
  completedAt: Date | null;
  noShowParty: NoShowParty | null;
  paymentRequired: boolean;
  priceMinor: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  session: BookingSession;
  offering: BookingOffering;
  mentor: BookingParticipant;
  mentee: BookingParticipant;
}
