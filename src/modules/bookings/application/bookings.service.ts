import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  MENTOR_SETTINGS_PORT,
  type MentorSettingsPort,
} from '../../scheduling/application/ports/mentor-settings.port.js';
import {
  SCHEDULING_REPOSITORY,
  type SchedulingRepositoryPort,
} from '../../scheduling/application/ports/scheduling.repository.js';
import {
  generateSlots,
  InvalidAvailabilityRuleError,
} from '../../scheduling/domain/slot-generator.js';
import type { Booking, BookingParticipant } from '../domain/booking.js';
import {
  InvalidBookingTransitionError,
  transitionBooking,
  type BookingActor,
  type BookingEvent,
  type BookingStatus,
} from '../domain/booking-status.js';
import {
  bookingExpired,
  bookingForbidden,
  bookingMenteeOverlap,
  bookingNotFound,
  bookingRoleNotAllowed,
  bookingSlotTaken,
  bookingSlotUnavailable,
  bookingStatusConflict,
  invalidBookingTransition,
  meetingUrlRequired,
  menteeProfileRequired,
  mentorNotApproved,
  offeringArchived,
  offeringNotFound,
} from './bookings.errors.js';
import type {
  AcceptBookingInput,
  CancelBookingInput,
  CreateBookingInput,
  DeclineBookingInput,
  ListBookingsInput,
} from './bookings.inputs.js';
import {
  BOOKING_REPOSITORY,
  BookingStatusConflictError,
  MenteeOverlapError,
  SlotTakenError,
  type BookingRepositoryPort,
  type BookingTransitionData,
} from './ports/booking.repository.js';
import {
  MENTEE_PROFILE_PORT,
  type MenteeProfilePort,
} from './ports/mentee-profile.port.js';
import {
  NOTIFICATIONS_PORT,
  type BookingNotification,
  type NotificationsPort,
} from './ports/notifications.port.js';

const HOUR_MS = 60 * 60 * 1000;

export interface BookingResponse {
  id: string;
  status: BookingStatus;
  message: string | null;
  requestedAt: string;
  respondedAt: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: Booking['cancelledBy'];
  cancelReason: string | null;
  completedAt: string | null;
  noShowParty: Booking['noShowParty'];
  paymentRequired: boolean;
  priceMinor: number;
  currency: string;
  session: {
    id: string;
    offeringId: string;
    mentorId: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    status: Booking['session']['status'];
    meetingUrl: string | null;
  };
  offering: Booking['offering'];
  mentor: ParticipantResponse;
  mentee: ParticipantResponse;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  timezone: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly ttlHours: number;

  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly repository: BookingRepositoryPort,
    @Inject(SCHEDULING_REPOSITORY)
    private readonly scheduling: SchedulingRepositoryPort,
    @Inject(MENTOR_SETTINGS_PORT)
    private readonly mentorSettings: MentorSettingsPort,
    @Inject(MENTEE_PROFILE_PORT)
    private readonly menteeProfile: MenteeProfilePort,
    @Inject(NOTIFICATIONS_PORT)
    private readonly notifications: NotificationsPort,
    @Inject(CLOCK) private readonly clock: Clock,
    configService: ConfigService,
  ) {
    this.ttlHours = configService.getOrThrow<number>(
      'BOOKING_REQUEST_TTL_HOURS',
    );
  }

  async create(
    user: AuthUser,
    input: CreateBookingInput,
  ): Promise<BookingResponse> {
    this.assertRole(user, 'mentee', 'request');

    if (!(await this.menteeProfile.exists(user.id))) {
      throw menteeProfileRequired();
    }

    const now = this.clock.now();
    const startsAt = parseInstant(input.startsAt);
    const offering = await this.scheduling.findOfferingById(input.offeringId);

    if (!offering) {
      throw offeringNotFound();
    }

    if (!offering.active || offering.archivedAt) {
      throw offeringArchived();
    }

    if (offering.type !== 'one_to_one' || offering.capacity !== 1) {
      throw bookingSlotUnavailable();
    }

    const settings = await this.mentorSettings.findMentorSettings(
      offering.mentorId,
    );

    if (
      !settings ||
      settings.status !== 'approved' ||
      settings.userStatus !== 'active'
    ) {
      throw mentorNotApproved();
    }

    const endsAt = new Date(
      startsAt.getTime() + offering.durationMinutes * 60 * 1000,
    );

    await this.assertAvailableSlot(
      offering.mentorId,
      offering.durationMinutes,
      startsAt,
      endsAt,
      now,
      settings.minNoticeHours,
      settings.maxAdvanceDays,
    );

    const expiresAt = new Date(now.getTime() + this.ttlHours * HOUR_MS);

    let booking: Booking;

    try {
      booking = await this.repository.create({
        offeringId: offering.id,
        mentorId: offering.mentorId,
        menteeId: user.id,
        startsAt,
        endsAt,
        requestedAt: now,
        expiresAt,
        paymentRequired: !offering.isFree,
        priceMinor: offering.priceMinor,
        currency: offering.currency,
        message: input.message ?? null,
      });
    } catch (error) {
      if (error instanceof SlotTakenError) {
        throw bookingSlotTaken();
      }

      if (error instanceof MenteeOverlapError) {
        throw bookingMenteeOverlap();
      }

      throw error;
    }

    await this.notifyRequested(booking);

    return toBookingResponse(booking);
  }

  async list(
    user: AuthUser,
    query: ListBookingsInput,
  ): Promise<{ items: BookingResponse[]; nextCursor: string | null }> {
    const scope = this.scopeFor(user);

    const expired = await this.repository.expireDue(this.clock.now(), scope);
    await this.notifyExpired(expired);

    const records = await this.repository.list({
      ...scope,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;

    return {
      items: page.map(toBookingResponse),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async get(user: AuthUser, id: string): Promise<BookingResponse> {
    const booking = await this.loadForParticipant(user, id);
    const expired = await this.expireIfDue(booking);

    return toBookingResponse(expired ?? booking);
  }

  async accept(
    user: AuthUser,
    id: string,
    input: AcceptBookingInput,
  ): Promise<BookingResponse> {
    this.assertRole(user, 'mentor', 'accept');
    const booking = await this.loadForParticipant(user, id);
    await this.assertNotExpired(booking);

    const now = this.clock.now();
    const next = this.transition(
      booking,
      { type: 'accept', paymentRequired: booking.paymentRequired },
      now,
    );

    if (next === 'confirmed' && !input.meetingUrl) {
      throw meetingUrlRequired();
    }

    const updated = await this.apply(booking, next, {
      respondedAt: now,
      ...(next === 'confirmed' ? { confirmedAt: now } : {}),
      ...(input.meetingUrl !== undefined
        ? { meetingUrl: input.meetingUrl }
        : {}),
    });

    await this.notifyAccepted(updated);

    return toBookingResponse(updated);
  }

  async decline(
    user: AuthUser,
    id: string,
    input: DeclineBookingInput,
  ): Promise<BookingResponse> {
    this.assertRole(user, 'mentor', 'decline');
    const booking = await this.loadForParticipant(user, id);
    await this.assertNotExpired(booking);

    const now = this.clock.now();
    const next = this.transition(booking, { type: 'decline' }, now);
    const updated = await this.apply(booking, next, {
      respondedAt: now,
      cancelReason: input.reason ?? null,
      sessionStatus: 'cancelled',
    });

    await this.notifyDeclined(updated);

    return toBookingResponse(updated);
  }

  async cancel(
    user: AuthUser,
    id: string,
    input: CancelBookingInput,
  ): Promise<BookingResponse> {
    const actor = this.actorFor(user);
    const booking = await this.loadForParticipant(user, id);
    await this.assertNotExpired(booking);

    const now = this.clock.now();
    const next = this.transition(
      booking,
      { type: 'cancel', actor },
      now,
    );
    const updated = await this.apply(booking, next, {
      cancelledAt: now,
      cancelledBy: actor,
      cancelReason: input.reason ?? null,
      sessionStatus: 'cancelled',
    });

    await this.notifyCancelled(updated, actor);

    return toBookingResponse(updated);
  }

  async complete(user: AuthUser, id: string): Promise<BookingResponse> {
    this.assertRole(user, 'mentor', 'complete');
    const booking = await this.loadForParticipant(user, id);
    await this.assertNotExpired(booking);

    const now = this.clock.now();
    const next = this.transition(booking, { type: 'complete' }, now);
    const updated = await this.apply(booking, next, {
      completedAt: now,
      sessionStatus: 'completed',
    });

    return toBookingResponse(updated);
  }

  async noShow(user: AuthUser, id: string): Promise<BookingResponse> {
    const actor = this.actorFor(user);
    const booking = await this.loadForParticipant(user, id);
    await this.assertNotExpired(booking);

    const now = this.clock.now();
    const next = this.transition(
      booking,
      { type: 'no_show', party: actor },
      now,
    );
    const updated = await this.apply(booking, next, {
      noShowParty: actor,
      sessionStatus: 'completed',
    });

    return toBookingResponse(updated);
  }

  async expireDue(): Promise<number> {
    const expired = await this.repository.expireDue(this.clock.now());
    await this.notifyExpired(expired);

    return expired.length;
  }

  private async assertAvailableSlot(
    mentorId: string,
    durationMinutes: number,
    startsAt: Date,
    endsAt: Date,
    now: Date,
    minNoticeHours: number,
    maxAdvanceDays: number,
  ): Promise<void> {
    const rules = await this.scheduling.listAvailabilityRules(mentorId);

    try {
      const slots = generateSlots({
        rules,
        durationMinutes,
        from: startsAt,
        to: new Date(endsAt.getTime() + 1),
        now,
        minNoticeHours,
        maxAdvanceDays,
      });

      if (!slots.some((slot) => slot.startsAt.getTime() === startsAt.getTime())) {
        throw bookingSlotUnavailable();
      }
    } catch (error) {
      if (error instanceof InvalidAvailabilityRuleError) {
        throw bookingSlotUnavailable();
      }

      throw error;
    }
  }

  private async loadForParticipant(
    user: AuthUser,
    id: string,
  ): Promise<Booking> {
    const booking = await this.repository.findById(id);

    if (!booking) {
      throw bookingNotFound();
    }

    if (user.role === 'mentee' && booking.menteeId === user.id) {
      return booking;
    }

    if (user.role === 'mentor' && booking.session.mentorId === user.id) {
      return booking;
    }

    throw bookingForbidden();
  }

  private async assertNotExpired(booking: Booking): Promise<void> {
    if (booking.status === 'expired') {
      throw bookingExpired();
    }

    const expired = await this.expireIfDue(booking);

    if (expired) {
      throw bookingExpired();
    }
  }

  private async expireIfDue(booking: Booking): Promise<Booking | null> {
    if (booking.status !== 'requested' && booking.status !== 'awaiting_payment') {
      return null;
    }

    const expired = await this.repository.expireById(
      booking.id,
      this.clock.now(),
    );

    if (expired) {
      await this.notifyExpired([expired]);
    }

    return expired;
  }

  private transition(
    booking: Booking,
    event: BookingEvent,
    now: Date,
  ): BookingStatus {
    try {
      return transitionBooking(booking.status, event, {
        now,
        startsAt: booking.session.startsAt,
        endsAt: booking.session.endsAt,
        expiresAt: booking.expiresAt,
        paymentRequired: booking.paymentRequired,
      });
    } catch (error) {
      if (error instanceof InvalidBookingTransitionError) {
        throw invalidBookingTransition(error.message);
      }

      throw error;
    }
  }

  private async apply(
    booking: Booking,
    next: BookingStatus,
    data: Omit<BookingTransitionData, 'status'>,
  ): Promise<Booking> {
    try {
      return await this.repository.applyTransition(booking.id, booking.status, {
        ...data,
        status: next,
      });
    } catch (error) {
      if (error instanceof BookingStatusConflictError) {
        throw bookingStatusConflict();
      }

      throw error;
    }
  }

  private scopeFor(user: AuthUser): { menteeId?: string; mentorId?: string } {
    if (user.role === 'mentee') {
      return { menteeId: user.id };
    }

    if (user.role === 'mentor') {
      return { mentorId: user.id };
    }

    throw bookingRoleNotAllowed('list');
  }

  private actorFor(user: AuthUser): BookingActor {
    if (user.role === 'mentee' || user.role === 'mentor') {
      return user.role;
    }

    throw bookingRoleNotAllowed('manage');
  }

  private assertRole(
    user: AuthUser,
    role: 'mentee' | 'mentor',
    action: string,
  ): void {
    if (user.role !== role) {
      throw bookingRoleNotAllowed(action);
    }
  }

  private async notifyRequested(booking: Booking): Promise<void> {
    await this.notify({
      type: 'requested',
      bookingId: booking.id,
      recipientEmail: booking.mentor.email,
      recipientName: displayName(booking.mentor, 'mentora'),
      counterpartName: displayName(booking.mentee, 'una mentee'),
      offeringTitle: booking.offering.title,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      expiresAt: booking.expiresAt,
      timezone: booking.mentor.timezone,
      meetingUrl: null,
      reason: null,
    });
  }

  private async notifyAccepted(booking: Booking): Promise<void> {
    await this.notify({
      type: 'accepted',
      bookingId: booking.id,
      recipientEmail: booking.mentee.email,
      recipientName: displayName(booking.mentee, 'mentee'),
      counterpartName: displayName(booking.mentor, 'tu mentora'),
      offeringTitle: booking.offering.title,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      expiresAt: booking.expiresAt,
      timezone: booking.mentor.timezone,
      meetingUrl: booking.session.meetingUrl,
      reason: null,
    });
  }

  private async notifyDeclined(booking: Booking): Promise<void> {
    await this.notify({
      type: 'declined',
      bookingId: booking.id,
      recipientEmail: booking.mentee.email,
      recipientName: displayName(booking.mentee, 'mentee'),
      counterpartName: displayName(booking.mentor, 'tu mentora'),
      offeringTitle: booking.offering.title,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      expiresAt: booking.expiresAt,
      timezone: booking.mentor.timezone,
      meetingUrl: null,
      reason: booking.cancelReason,
    });
  }

  private async notifyCancelled(
    booking: Booking,
    actor: BookingActor,
  ): Promise<void> {
    const recipient = actor === 'mentee' ? booking.mentor : booking.mentee;
    const counterpart = actor === 'mentee' ? booking.mentee : booking.mentor;

    await this.notify({
      type: 'cancelled',
      bookingId: booking.id,
      recipientEmail: recipient.email,
      recipientName: displayName(recipient, 'mentora'),
      counterpartName: displayName(counterpart, 'la otra persona'),
      offeringTitle: booking.offering.title,
      startsAt: booking.session.startsAt,
      endsAt: booking.session.endsAt,
      expiresAt: booking.expiresAt,
      timezone: booking.mentor.timezone,
      meetingUrl: null,
      reason: booking.cancelReason,
    });
  }

  private async notifyExpired(bookings: Booking[]): Promise<void> {
    for (const booking of bookings) {
      await this.notify({
        type: 'expired',
        bookingId: booking.id,
        recipientEmail: booking.mentee.email,
        recipientName: displayName(booking.mentee, 'mentee'),
        counterpartName: displayName(booking.mentor, 'tu mentora'),
        offeringTitle: booking.offering.title,
        startsAt: booking.session.startsAt,
        endsAt: booking.session.endsAt,
        expiresAt: booking.expiresAt,
        timezone: booking.mentor.timezone,
        meetingUrl: null,
        reason: null,
      });

      await this.notify({
        type: 'expired',
        bookingId: booking.id,
        recipientEmail: booking.mentor.email,
        recipientName: displayName(booking.mentor, 'mentora'),
        counterpartName: displayName(booking.mentee, 'una mentee'),
        offeringTitle: booking.offering.title,
        startsAt: booking.session.startsAt,
        endsAt: booking.session.endsAt,
        expiresAt: booking.expiresAt,
        timezone: booking.mentor.timezone,
        meetingUrl: null,
        reason: null,
      });
    }
  }

  private async notify(notification: BookingNotification): Promise<void> {
    try {
      await this.notifications.send(notification);
    } catch (error) {
      // ADR-022: email is best effort and never rolls back the booking.
      this.logger.error(
        `Booking notification failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}

function parseInstant(value: string): Date {
  const instant = new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw bookingSlotUnavailable();
  }

  return instant;
}

function displayName(
  participant: BookingParticipant,
  fallback: string,
): string {
  return participant.firstName ?? fallback;
}

function toBookingResponse(booking: Booking): BookingResponse {
  return {
    id: booking.id,
    status: booking.status,
    message: booking.message,
    requestedAt: booking.requestedAt.toISOString(),
    respondedAt: booking.respondedAt?.toISOString() ?? null,
    expiresAt: booking.expiresAt.toISOString(),
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    cancelledBy: booking.cancelledBy,
    cancelReason: booking.cancelReason,
    completedAt: booking.completedAt?.toISOString() ?? null,
    noShowParty: booking.noShowParty,
    paymentRequired: booking.paymentRequired,
    priceMinor: booking.priceMinor,
    currency: booking.currency,
    session: {
      id: booking.session.id,
      offeringId: booking.session.offeringId,
      mentorId: booking.session.mentorId,
      startsAt: booking.session.startsAt.toISOString(),
      endsAt: booking.session.endsAt.toISOString(),
      capacity: booking.session.capacity,
      status: booking.session.status,
      meetingUrl: booking.session.meetingUrl,
    },
    offering: booking.offering,
    mentor: toParticipantResponse(booking.mentor),
    mentee: toParticipantResponse(booking.mentee),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

function toParticipantResponse(
  participant: BookingParticipant,
): ParticipantResponse {
  return {
    id: participant.id,
    firstName: participant.firstName,
    lastName: participant.lastName,
    timezone: participant.timezone,
  };
}
