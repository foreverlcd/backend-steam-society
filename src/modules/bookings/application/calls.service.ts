import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import type { Booking, BookingParticipant } from '../domain/booking.js';
import {
  bookingForbidden,
  bookingNotFound,
  callNotOpen,
  callUnavailable,
} from './bookings.errors.js';
import {
  BOOKING_REPOSITORY,
  type BookingRepositoryPort,
} from './ports/booking.repository.js';
import {
  CALL_SIGNALING_PORT,
  ICE_SERVERS_PORT,
  type CallEvent,
  type CallSignal,
  type CallSignalingPort,
  type IceServer,
  type IceServersPort,
} from './ports/call-signaling.port.js';

/** Participants can enter a bit early to test camera and microphone. */
export const CALL_OPENS_BEFORE_MS = 15 * 60_000;
/** Sessions that run over still have time to finish. */
export const CALL_CLOSES_AFTER_MS = 30 * 60_000;
const PING_INTERVAL_MS = 25_000;

export interface CallInfo {
  bookingId: string;
  role: 'mentee' | 'mentor';
  offeringTitle: string;
  peerName: string;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  closesAt: string;
  open: boolean;
  /** External link the mentor may have shared, as a plan B. */
  meetingUrl: string | null;
  /** Only while the call is open (TURN credentials are short-lived). */
  iceServers: IceServer[];
}

interface CallAccess {
  booking: Booking;
  role: 'mentee' | 'mentor';
  peerId: string;
  opensAt: Date;
  closesAt: Date;
}

@Injectable()
export class CallsService {
  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly repository: BookingRepositoryPort,
    @Inject(CALL_SIGNALING_PORT)
    private readonly signaling: CallSignalingPort,
    @Inject(ICE_SERVERS_PORT) private readonly ice: IceServersPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async info(user: AuthUser, bookingId: string): Promise<CallInfo> {
    const access = await this.access(user, bookingId);
    const open = this.isOpen(access);
    const { booking } = access;
    const peer = access.role === 'mentee' ? booking.mentor : booking.mentee;

    return {
      bookingId: booking.id,
      role: access.role,
      offeringTitle: booking.offering.title,
      peerName: fullName(
        peer,
        access.role === 'mentee' ? 'Tu mentora' : 'Tu mentee',
      ),
      startsAt: booking.session.startsAt.toISOString(),
      endsAt: booking.session.endsAt.toISOString(),
      opensAt: access.opensAt.toISOString(),
      closesAt: access.closesAt.toISOString(),
      open,
      meetingUrl: booking.session.meetingUrl,
      iceServers: open ? await this.ice.forCall() : [],
    };
  }

  /** Event stream of one participant; leaving the call ends it. */
  async join(
    user: AuthUser,
    bookingId: string,
  ): Promise<Observable<CallEvent>> {
    const access = await this.openAccess(user, bookingId);
    const closesInMs = access.closesAt.getTime() - this.clock.now().getTime();

    return new Observable<CallEvent>((subscriber) => {
      const leave = this.signaling.join(bookingId, user.id, {
        push: (event) => subscriber.next(event),
        close: () => subscriber.complete(),
      });
      // Keeps proxies from closing an idle stream.
      const ping = setInterval(
        () => subscriber.next({ type: 'ping' }),
        PING_INTERVAL_MS,
      );
      const closing = setTimeout(() => subscriber.complete(), closesInMs);

      return () => {
        clearInterval(ping);
        clearTimeout(closing);
        leave();
      };
    });
  }

  async signal(
    user: AuthUser,
    bookingId: string,
    data: CallSignal,
  ): Promise<{ delivered: boolean }> {
    const access = await this.openAccess(user, bookingId);
    const delivered = this.signaling.send(bookingId, access.peerId, {
      type: 'signal',
      data,
    });
    return { delivered };
  }

  private async openAccess(
    user: AuthUser,
    bookingId: string,
  ): Promise<CallAccess> {
    const access = await this.access(user, bookingId);
    if (!this.isOpen(access)) throw callNotOpen();
    return access;
  }

  private async access(user: AuthUser, bookingId: string): Promise<CallAccess> {
    const booking = await this.repository.findById(bookingId);
    if (!booking) throw bookingNotFound();

    let role: CallAccess['role'];
    if (user.role === 'mentee' && booking.menteeId === user.id) {
      role = 'mentee';
    } else if (user.role === 'mentor' && booking.session.mentorId === user.id) {
      role = 'mentor';
    } else {
      throw bookingForbidden();
    }

    if (booking.status !== 'confirmed' || booking.session.status !== 'open') {
      throw callUnavailable();
    }

    return {
      booking,
      role,
      peerId: role === 'mentee' ? booking.session.mentorId : booking.menteeId,
      opensAt: new Date(
        booking.session.startsAt.getTime() - CALL_OPENS_BEFORE_MS,
      ),
      closesAt: new Date(
        booking.session.endsAt.getTime() + CALL_CLOSES_AFTER_MS,
      ),
    };
  }

  private isOpen(access: CallAccess): boolean {
    const now = this.clock.now().getTime();
    return now >= access.opensAt.getTime() && now < access.closesAt.getTime();
  }
}

function fullName(participant: BookingParticipant, fallback: string): string {
  const name = [participant.firstName, participant.lastName]
    .filter(Boolean)
    .join(' ');
  return name || fallback;
}
