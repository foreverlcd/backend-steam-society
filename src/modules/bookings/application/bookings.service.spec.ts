import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth.types.js';
import type { MentorSettingsPort } from '../../scheduling/application/ports/mentor-settings.port.js';
import type { SchedulingRepositoryPort } from '../../scheduling/application/ports/scheduling.repository.js';
import type { AvailabilityRule } from '../../scheduling/domain/availability-rule.js';
import type { Offering } from '../../scheduling/domain/offering.js';
import type { Booking } from '../domain/booking.js';
import { BookingsService } from './bookings.service.js';
import {
  BookingStatusConflictError,
  MenteeOverlapError,
  SlotTakenError,
  type BookingRepositoryPort,
} from './ports/booking.repository.js';
import type { MenteeProfilePort } from './ports/mentee-profile.port.js';
import type { NotificationsPort } from './ports/notifications.port.js';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const STARTS_AT = new Date('2026-11-03T15:00:00.000Z');
const ENDS_AT = new Date('2026-11-03T16:00:00.000Z');
const EXPIRES_AT = new Date('2026-11-04T12:00:00.000Z');

const mentor: AuthUser = {
  id: 'mentor-1',
  email: 'mentor@example.com',
  role: 'mentor',
  status: 'active',
  firstName: 'Ana',
  lastName: 'Perez',
  birthDate: null,
};

const mentee: AuthUser = {
  id: 'mentee-1',
  email: 'mentee@example.com',
  role: 'mentee',
  status: 'active',
  firstName: 'Lucia',
  lastName: 'Diaz',
  birthDate: null,
};

const rule: AvailabilityRule = {
  id: 'rule-1',
  userId: mentor.id,
  weekday: 2,
  startTime: '09:00',
  endTime: '17:00',
  timezone: 'America/Lima',
  validFrom: null,
  validTo: null,
  createdAt: NOW,
};

const offering: Offering = {
  id: 'offering-1',
  mentorId: mentor.id,
  title: 'Mentoria',
  description: null,
  type: 'one_to_one',
  durationMinutes: 60,
  capacity: 1,
  isFree: true,
  priceMinor: 0,
  currency: 'PEN',
  active: true,
  archivedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    sessionId: 'session-1',
    menteeId: mentee.id,
    status: 'requested',
    message: null,
    requestedAt: NOW,
    respondedAt: null,
    expiresAt: EXPIRES_AT,
    confirmedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    completedAt: null,
    noShowParty: null,
    paymentRequired: false,
    priceMinor: 0,
    currency: 'PEN',
    createdAt: NOW,
    updatedAt: NOW,
    session: {
      id: 'session-1',
      offeringId: offering.id,
      mentorId: mentor.id,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      capacity: 1,
      status: 'open',
      meetingUrl: null,
    },
    offering: {
      id: offering.id,
      title: offering.title,
      durationMinutes: offering.durationMinutes,
      isFree: offering.isFree,
      priceMinor: offering.priceMinor,
      currency: offering.currency,
    },
    mentor: {
      id: mentor.id,
      firstName: mentor.firstName,
      lastName: mentor.lastName,
      email: mentor.email,
      timezone: 'America/Lima',
    },
    mentee: {
      id: mentee.id,
      firstName: mentee.firstName,
      lastName: mentee.lastName,
      email: mentee.email,
      timezone: 'America/Lima',
    },
    ...overrides,
  };
}

function errorCode(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return (response as { code?: string } | undefined)?.code;
}

type MockPort<T> = {
  [Key in keyof T]: ReturnType<typeof vi.fn>;
};

describe('BookingsService', () => {
  let repository: MockPort<BookingRepositoryPort>;
  let scheduling: MockPort<SchedulingRepositoryPort>;
  let mentorSettings: MockPort<MentorSettingsPort>;
  let menteeProfile: MockPort<MenteeProfilePort>;
  let notifications: MockPort<NotificationsPort>;
  let service: BookingsService;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      applyTransition: vi.fn(),
      expireById: vi.fn(),
      expireDue: vi.fn(),
    };
    scheduling = {
      findOfferingById: vi.fn().mockResolvedValue(offering),
      listAvailabilityRules: vi.fn().mockResolvedValue([rule]),
    } as unknown as MockPort<SchedulingRepositoryPort>;
    mentorSettings = {
      findMentorSettings: vi.fn().mockResolvedValue({
        status: 'approved',
        userStatus: 'active',
        minNoticeHours: 0,
        maxAdvanceDays: 60,
        timezone: 'America/Lima',
      }),
    };
    menteeProfile = { exists: vi.fn().mockResolvedValue(true) };
    notifications = { send: vi.fn().mockResolvedValue(undefined) };
    service = new BookingsService(
      repository as unknown as BookingRepositoryPort,
      scheduling as unknown as SchedulingRepositoryPort,
      mentorSettings as unknown as MentorSettingsPort,
      menteeProfile as unknown as MenteeProfilePort,
      notifications as unknown as NotificationsPort,
      { now: () => NOW },
      { getOrThrow: () => 48 } as unknown as ConfigService,
    );
  });

  describe('create', () => {
    it('rejects accounts that are not mentees', async () => {
      await expect(
        service.create(mentor, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'BOOKING_ROLE_NOT_ALLOWED',
      );
    });

    it('requires a mentee profile', async () => {
      menteeProfile.exists.mockResolvedValue(false);

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'MENTEE_PROFILE_REQUIRED',
      );
    });

    it('rejects an unknown offering', async () => {
      scheduling.findOfferingById.mockResolvedValue(null);

      await expect(
        service.create(mentee, {
          offeringId: 'missing',
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'OFFERING_NOT_FOUND',
      );
    });

    it('rejects an archived offering', async () => {
      scheduling.findOfferingById.mockResolvedValue({
        ...offering,
        active: false,
        archivedAt: NOW,
      });

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'OFFERING_ARCHIVED',
      );
    });

    it('rejects a mentor that is not approved', async () => {
      mentorSettings.findMentorSettings.mockResolvedValue({
        status: 'pending_review',
        userStatus: 'active',
        minNoticeHours: 0,
        maxAdvanceDays: 60,
        timezone: 'America/Lima',
      });

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'MENTOR_NOT_APPROVED',
      );
    });

    it('rejects a time outside the availability', async () => {
      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: '2026-11-03T15:30:00.000Z',
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'BOOKING_SLOT_UNAVAILABLE',
      );
    });

    it('creates a free booking without payment and notifies the mentor', async () => {
      const booking = makeBooking();
      repository.create.mockResolvedValue(booking);

      const result = await service.create(mentee, {
        offeringId: offering.id,
        startsAt: STARTS_AT.toISOString(),
        message: 'Hola',
      });

      expect(repository.create).toHaveBeenCalledWith({
        offeringId: offering.id,
        mentorId: mentor.id,
        menteeId: mentee.id,
        startsAt: STARTS_AT,
        endsAt: ENDS_AT,
        requestedAt: NOW,
        expiresAt: EXPIRES_AT,
        paymentRequired: false,
        priceMinor: 0,
        currency: 'PEN',
        message: 'Hola',
      });
      expect(result.status).toBe('requested');
      expect(result.paymentRequired).toBe(false);
      expect(result.priceMinor).toBe(0);
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'requested',
          recipientEmail: mentor.email,
          bookingId: booking.id,
        }),
      );
    });

    it('creates a paid booking with paymentRequired', async () => {
      const paidOffering = {
        ...offering,
        isFree: false,
        priceMinor: 5000,
      };
      scheduling.findOfferingById.mockResolvedValue(paidOffering);
      repository.create.mockResolvedValue(
        makeBooking({ paymentRequired: true, priceMinor: 5000 }),
      );

      await service.create(mentee, {
        offeringId: offering.id,
        startsAt: STARTS_AT.toISOString(),
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentRequired: true,
          priceMinor: 5000,
        }),
      );
    });

    it('maps a mentor slot conflict', async () => {
      repository.create.mockRejectedValue(new SlotTakenError());

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'BOOKING_SLOT_TAKEN',
      );
    });

    it('maps a mentee overlap conflict', async () => {
      repository.create.mockRejectedValue(new MenteeOverlapError());

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'BOOKING_MENTEE_OVERLAP',
      );
    });

    it('does not fail when the notification fails', async () => {
      repository.create.mockResolvedValue(makeBooking());
      notifications.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.create(mentee, {
          offeringId: offering.id,
          startsAt: STARTS_AT.toISOString(),
        }),
      ).resolves.toMatchObject({ status: 'requested' });
    });
  });

  describe('accept', () => {
    it('requires a meeting URL for a free booking', async () => {
      repository.findById.mockResolvedValue(makeBooking());

      await expect(service.accept(mentor, 'booking-1', {})).rejects.toSatisfy(
        (error) => errorCode(error) === 'MEETING_URL_REQUIRED',
      );
      expect(repository.applyTransition).not.toHaveBeenCalled();
    });

    it('confirms a free booking and stores the meeting URL', async () => {
      const booking = makeBooking();
      repository.findById.mockResolvedValue(booking);
      repository.applyTransition.mockResolvedValue(
        makeBooking({
          status: 'confirmed',
          confirmedAt: NOW,
          respondedAt: NOW,
          session: { ...booking.session, meetingUrl: 'https://meet.example.com/a' },
        }),
      );

      const result = await service.accept(mentor, 'booking-1', {
        meetingUrl: 'https://meet.example.com/a',
      });

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'requested',
        expect.objectContaining({
          status: 'confirmed',
          confirmedAt: NOW,
          meetingUrl: 'https://meet.example.com/a',
        }),
      );
      expect(result.status).toBe('confirmed');
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'accepted' }),
      );
    });

    it('moves a paid booking to awaiting_payment without a meeting URL', async () => {
      const booking = makeBooking({ paymentRequired: true, priceMinor: 5000 });
      repository.findById.mockResolvedValue(booking);
      repository.applyTransition.mockResolvedValue(
        makeBooking({
          status: 'awaiting_payment',
          paymentRequired: true,
          priceMinor: 5000,
          respondedAt: NOW,
        }),
      );

      const result = await service.accept(mentor, 'booking-1', {});

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'requested',
        expect.objectContaining({ status: 'awaiting_payment' }),
      );
      expect(result.status).toBe('awaiting_payment');
    });
  });

  describe('other transitions', () => {
    it('declines a request and cancels the session', async () => {
      repository.findById.mockResolvedValue(makeBooking());
      repository.applyTransition.mockResolvedValue(
        makeBooking({ status: 'declined', respondedAt: NOW }),
      );

      const result = await service.decline(mentor, 'booking-1', {
        reason: 'Sin espacio',
      });

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'requested',
        expect.objectContaining({
          status: 'declined',
          sessionStatus: 'cancelled',
          cancelReason: 'Sin espacio',
        }),
      );
      expect(result.status).toBe('declined');
    });

    it('lets a mentee cancel a request', async () => {
      repository.findById.mockResolvedValue(makeBooking());
      repository.applyTransition.mockResolvedValue(
        makeBooking({
          status: 'cancelled',
          cancelledAt: NOW,
          cancelledBy: 'mentee',
        }),
      );

      const result = await service.cancel(mentee, 'booking-1', {});

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'requested',
        expect.objectContaining({
          status: 'cancelled',
          cancelledBy: 'mentee',
          sessionStatus: 'cancelled',
        }),
      );
      expect(result.status).toBe('cancelled');
    });

    it('does not let a mentor cancel a pending request', async () => {
      repository.findById.mockResolvedValue(makeBooking());

      await expect(
        service.cancel(mentor, 'booking-1', {}),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'INVALID_BOOKING_TRANSITION',
      );
    });

    it('completes a confirmed booking after it ends', async () => {
      const booking = makeBooking({
        status: 'confirmed',
        session: {
          ...makeBooking().session,
          startsAt: new Date('2026-11-02T10:00:00.000Z'),
          endsAt: new Date('2026-11-02T11:00:00.000Z'),
        },
      });
      repository.findById.mockResolvedValue(booking);
      repository.applyTransition.mockResolvedValue(
        makeBooking({ status: 'completed', completedAt: NOW }),
      );

      const result = await service.complete(mentor, 'booking-1');

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'confirmed',
        expect.objectContaining({
          status: 'completed',
          completedAt: NOW,
          sessionStatus: 'completed',
        }),
      );
      expect(result.status).toBe('completed');
    });

    it('registers the no-show party after the session starts', async () => {
      repository.findById.mockResolvedValue(
        makeBooking({
          status: 'confirmed',
          session: {
            ...makeBooking().session,
            startsAt: new Date('2026-11-02T11:00:00.000Z'),
            endsAt: new Date('2026-11-02T12:00:00.000Z'),
          },
        }),
      );
      repository.applyTransition.mockResolvedValue(
        makeBooking({ status: 'no_show', noShowParty: 'mentee' }),
      );

      const result = await service.noShow(mentee, 'booking-1');

      expect(repository.applyTransition).toHaveBeenCalledWith(
        'booking-1',
        'confirmed',
        expect.objectContaining({
          status: 'no_show',
          noShowParty: 'mentee',
          sessionStatus: 'completed',
        }),
      );
      expect(result.status).toBe('no_show');
    });

    it('maps a concurrent status change to a conflict', async () => {
      repository.findById.mockResolvedValue(makeBooking());
      repository.applyTransition.mockRejectedValue(
        new BookingStatusConflictError(),
      );

      await expect(
        service.decline(mentor, 'booking-1', {}),
      ).rejects.toSatisfy(
        (error) => errorCode(error) === 'BOOKING_STATUS_CONFLICT',
      );
    });
  });

  describe('expiration', () => {
    it('returns the expired booking when it is read after the deadline', async () => {
      const expired = makeBooking({ status: 'expired' });
      repository.findById.mockResolvedValue(
        makeBooking({ expiresAt: new Date('2026-11-02T11:59:59.999Z') }),
      );
      repository.expireById.mockResolvedValue(expired);

      const result = await service.get(mentee, 'booking-1');

      expect(repository.expireById).toHaveBeenCalledWith('booking-1', NOW);
      expect(result.status).toBe('expired');
    });

    it('rejects acting on an expired booking', async () => {
      repository.findById.mockResolvedValue(makeBooking());
      repository.expireById.mockResolvedValue(
        makeBooking({ status: 'expired' }),
      );

      await expect(
        service.decline(mentor, 'booking-1', {}),
      ).rejects.toSatisfy((error) => errorCode(error) === 'BOOKING_EXPIRED');
    });

    it('expires due bookings idempotently', async () => {
      repository.expireDue.mockResolvedValueOnce([
        makeBooking({ status: 'expired' }),
      ]);
      repository.expireDue.mockResolvedValueOnce([]);

      await expect(service.expireDue()).resolves.toBe(1);
      await expect(service.expireDue()).resolves.toBe(0);
    });
  });

  describe('list', () => {
    it('expires due bookings before listing and paginates by cursor', async () => {
      repository.expireDue.mockResolvedValue([]);
      repository.list.mockResolvedValue([
        makeBooking({ id: 'booking-2' }),
        makeBooking({ id: 'booking-1' }),
      ]);

      const result = await service.list(mentee, { limit: 1 });

      expect(repository.expireDue).toHaveBeenCalledWith(NOW, {
        menteeId: mentee.id,
      });
      expect(repository.list).toHaveBeenCalledWith({
        menteeId: mentee.id,
        limit: 1,
        status: undefined,
        cursor: undefined,
      });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe('booking-2');
    });

    it('scopes mentor listings to their own sessions', async () => {
      repository.expireDue.mockResolvedValue([]);
      repository.list.mockResolvedValue([]);

      await service.list(mentor, { limit: 20 });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ mentorId: mentor.id }),
      );
    });
  });

  it('does not expose bookings that belong to another user', async () => {
    repository.findById.mockResolvedValue(
      makeBooking({ menteeId: 'someone-else' }),
    );

    await expect(service.get(mentee, 'booking-1')).rejects.toSatisfy(
      (error) => errorCode(error) === 'BOOKING_FORBIDDEN',
    );
  });
});
