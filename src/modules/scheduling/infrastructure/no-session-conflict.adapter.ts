import { Injectable } from '@nestjs/common';
import type { BusyInterval } from '../domain/slot.js';
import type { SessionConflictPort } from '../application/ports/session-conflict.port.js';

/**
 * 1.4 has no session/booking table yet. This adapter keeps the port wired so
 * the slot generator can be tested and so 1.5 only has to replace the
 * implementation, not the callers.
 */
@Injectable()
export class NoSessionConflictAdapter implements SessionConflictPort {
  async findBusyIntervals(): Promise<BusyInterval[]> {
    return [];
  }
}
