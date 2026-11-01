import type { BusyInterval } from '../../domain/slot.js';

export const SESSION_CONFLICT_PORT = Symbol('SESSION_CONFLICT_PORT');

export interface MentorBusyInterval extends BusyInterval {
  mentorId: string;
}

export interface SessionConflictPort {
  findBusyIntervals(
    mentorId: string,
    from: Date,
    to: Date,
  ): Promise<BusyInterval[]>;
  findBusyIntervalsForMentors(
    mentorIds: string[],
    from: Date,
    to: Date,
  ): Promise<MentorBusyInterval[]>;
}
