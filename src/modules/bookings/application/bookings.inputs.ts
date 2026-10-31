import type { BookingStatus } from '../domain/booking-status.js';

export interface CreateBookingInput {
  offeringId: string;
  startsAt: string;
  message?: string | null;
}

export interface ListBookingsInput {
  status?: BookingStatus;
  limit: number;
  cursor?: string;
}

export interface AcceptBookingInput {
  meetingUrl?: string;
}

export interface DeclineBookingInput {
  reason?: string | null;
}

export interface CancelBookingInput {
  reason?: string | null;
}
