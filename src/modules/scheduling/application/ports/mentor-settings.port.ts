import type { MentorSettings } from '../../domain/availability-rule.js';

export const MENTOR_SETTINGS_PORT = Symbol('MENTOR_SETTINGS_PORT');

/**
 * Scheduling needs the mentor status, notice window and timezone, but those
 * columns belong to the profiles module. This port keeps the ownership rule
 * from docs/02-ARCHITECTURE.md intact.
 */
export interface MentorSettingsPort {
  findMentorSettings(userId: string): Promise<MentorSettings | null>;
}
