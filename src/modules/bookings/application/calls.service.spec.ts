import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import type { Booking } from '../domain/booking.js';
import { CallsService } from './calls.service.js';
import type { BookingRepositoryPort } from './ports/booking.repository.js';
import type {
  CallSignalingPort,
  IceServersPort,
} from './ports/call-signaling.port.js';

const NOW = new Date('2026-11-20T15:00:00.000Z');

const mentee: AuthUser = {
  id: 'mentee-1',
  email: 'mentee@example.com',
  role: 'mentee',
  status: 'active',
  firstName: null,
  lastName: null,
  birthDate: null,
  emailVerified: true,
  mfaEnabled: false,
  guardianConsentPending: false,
};

function openBooking(): Booking {
  return {
    id: 'booking-1',
    menteeId: 'mentee-1',
    status: 'confirmed',
    session: {
      mentorId: 'mentor-1',
      status: 'open',
      startsAt: new Date(NOW.getTime() - 5 * 60_000),
      endsAt: new Date(NOW.getTime() + 55 * 60_000),
      meetingUrl: null,
    },
  } as unknown as Booking;
}

describe('CallsService.join session check', () => {
  let service: CallsService;
  const leave = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    leave.mockClear();
    const repository = {
      findById: async () => openBooking(),
    } as unknown as BookingRepositoryPort;
    const signaling = {
      join: () => leave,
    } as unknown as CallSignalingPort;
    const clock: Clock = { now: () => new Date() };
    service = new CallsService(
      repository,
      signaling,
      {} as IceServersPort,
      clock,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends the stream at the next ping once the session is gone', async () => {
    let alive = true;
    const stream = await service.join(mentee, 'booking-1', async () => alive);
    const events: string[] = [];
    let completed = false;
    stream.subscribe({
      next: (event) => events.push(event.type),
      complete: () => {
        completed = true;
      },
    });

    await vi.advanceTimersByTimeAsync(25_000);
    expect(events).toEqual(['ping']);
    expect(completed).toBe(false);

    alive = false;
    await vi.advanceTimersByTimeAsync(25_000);
    expect(completed).toBe(true);
    expect(leave).toHaveBeenCalled();
  });

  it('keeps the stream while the session lives', async () => {
    const stream = await service.join(mentee, 'booking-1', async () => true);
    let completed = false;
    stream.subscribe({
      complete: () => {
        completed = true;
      },
    });

    await vi.advanceTimersByTimeAsync(5 * 25_000);
    expect(completed).toBe(false);
  });
});
