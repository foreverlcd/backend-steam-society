import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import {
  generateSlots,
  InvalidAvailabilityRuleError,
  InvalidSlotRangeError,
  SlotRangeTooLargeError,
} from '../domain/slot-generator.js';
import type { Slot } from '../domain/slot.js';
import {
  MENTOR_SETTINGS_PORT,
  type MentorSettingsPort,
} from './ports/mentor-settings.port.js';
import {
  SESSION_CONFLICT_PORT,
  type SessionConflictPort,
} from './ports/session-conflict.port.js';
import {
  SCHEDULING_REPOSITORY,
  type SchedulingRepositoryPort,
} from './ports/scheduling.repository.js';
import {
  invalidAvailabilityRule,
  invalidSlotRange,
  offeringNotFound,
  slotRangeTooLarge,
} from './scheduling.errors.js';
import type { SlotsQueryInput } from './scheduling.inputs.js';

export interface SlotResponse {
  startsAt: string;
  endsAt: string;
  timezone: string;
  localStart: string;
  localEnd: string;
}

export interface SlotsResponse {
  mentorId: string;
  offeringId: string;
  durationMinutes: number;
  slots: SlotResponse[];
}

@Injectable()
export class SlotsService {
  constructor(
    @Inject(SCHEDULING_REPOSITORY)
    private readonly repository: SchedulingRepositoryPort,
    @Inject(MENTOR_SETTINGS_PORT)
    private readonly mentorSettings: MentorSettingsPort,
    @Inject(SESSION_CONFLICT_PORT)
    private readonly sessionConflict: SessionConflictPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getPublicSlots(
    mentorId: string,
    query: SlotsQueryInput,
  ): Promise<SlotsResponse> {
    const from = parseInstant(query.from);
    const to = parseInstant(query.to);
    const offering = await this.repository.findPublicOffering(
      mentorId,
      query.offeringId,
    );
    const settings = await this.mentorSettings.findMentorSettings(mentorId);

    if (
      !offering ||
      !settings ||
      settings.status !== 'approved' ||
      settings.userStatus !== 'active'
    ) {
      throw offeringNotFound();
    }

    const rules = await this.repository.listAvailabilityRules(mentorId);
    const busyIntervals = await this.sessionConflict.findBusyIntervals(
      mentorId,
      from,
      to,
    );

    try {
      const slots = generateSlots({
        rules,
        durationMinutes: offering.durationMinutes,
        from,
        to,
        now: this.clock.now(),
        minNoticeHours: settings.minNoticeHours,
        maxAdvanceDays: settings.maxAdvanceDays,
        busyIntervals,
      });

      return {
        mentorId,
        offeringId: offering.id,
        durationMinutes: offering.durationMinutes,
        slots: slots.map(toSlotResponse),
      };
    } catch (error) {
      if (error instanceof InvalidSlotRangeError) {
        throw invalidSlotRange(error.message);
      }

      if (error instanceof SlotRangeTooLargeError) {
        throw slotRangeTooLarge();
      }

      if (error instanceof InvalidAvailabilityRuleError) {
        throw invalidAvailabilityRule(error.message);
      }

      throw error;
    }
  }
}

function parseInstant(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw invalidSlotRange(`Invalid instant: ${value}`);
  }

  return date;
}

function toSlotResponse(slot: Slot): SlotResponse {
  return {
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    timezone: slot.timezone,
    localStart: slot.localStart,
    localEnd: slot.localEnd,
  };
}
