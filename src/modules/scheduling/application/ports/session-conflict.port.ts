import type { BusyInterval } from '../../domain/slot.js';

export const SESSION_CONFLICT_PORT = Symbol('SESSION_CONFLICT_PORT');

export interface SessionConflictPort {
  findBusyIntervals(
    mentorId: string,
    from: Date,
    to: Date,
  ): Promise<BusyInterval[]>;
}
