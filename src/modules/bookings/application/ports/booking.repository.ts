import type {
  Booking,
  CancelActor,
  NoShowParty,
  SessionStatus,
} from '../../domain/booking.js';
import type { BookingStatus } from '../../domain/booking-status.js';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface CreateBookingData {
  offeringId: string;
  mentorId: string;
  menteeId: string;
  startsAt: Date;
  endsAt: Date;
  requestedAt: Date;
  expiresAt: Date;
  paymentRequired: boolean;
  priceMinor: number;
  currency: string;
  message: string | null;
}

export interface BookingTransitionData {
  status: BookingStatus;
  respondedAt?: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: CancelActor;
  cancelReason?: string | null;
  completedAt?: Date;
  noShowParty?: NoShowParty;
  sessionStatus?: SessionStatus;
  meetingUrl?: string | null;
}

export interface BookingScope {
  menteeId?: string;
  mentorId?: string;
  status?: BookingStatus;
  limit?: number;
  cursor?: string;
}

export class SlotTakenError extends Error {
  constructor() {
    super('The mentor already has a session in this time range');
    this.name = 'SlotTakenError';
  }
}

export class MenteeOverlapError extends Error {
  constructor() {
    super('The mentee already has an active booking in this time range');
    this.name = 'MenteeOverlapError';
  }
}

export class BookingStatusConflictError extends Error {
  constructor() {
    super('The booking status changed while processing the request');
    this.name = 'BookingStatusConflictError';
  }
}

export interface BookingRepositoryPort {
  create(data: CreateBookingData): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  list(scope: BookingScope): Promise<Booking[]>;
  applyTransition(
    id: string,
    from: BookingStatus,
    data: BookingTransitionData,
  ): Promise<Booking>;
  expireById(id: string, now: Date): Promise<Booking | null>;
  expireDue(now: Date, scope?: BookingScope): Promise<Booking[]>;
}
