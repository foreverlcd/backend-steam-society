import { Inject, Injectable } from '@nestjs/common';
import { isValidTimeZone } from '../../../shared/time/iana.js';
import type { AuthUser } from '../../auth/auth.types.js';
import type { AvailabilityRule } from '../domain/availability-rule.js';
import { assertMentor } from './assert-mentor.js';
import {
  MENTOR_SETTINGS_PORT,
  type MentorSettingsPort,
} from './ports/mentor-settings.port.js';
import {
  SCHEDULING_REPOSITORY,
  type AvailabilityRuleData,
  type SchedulingRepositoryPort,
} from './ports/scheduling.repository.js';
import {
  invalidAvailabilityRange,
  invalidTimeZone,
  mentorNotApproved,
  mentorProfileNotFound,
} from './scheduling.errors.js';
import type {
  AvailabilityRuleInput,
  ReplaceAvailabilityInput,
} from './scheduling.inputs.js';

export interface AvailabilityRuleResponse {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface AvailabilityResponse {
  timezone: string;
  rules: AvailabilityRuleResponse[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(SCHEDULING_REPOSITORY)
    private readonly repository: SchedulingRepositoryPort,
    @Inject(MENTOR_SETTINGS_PORT)
    private readonly mentorSettings: MentorSettingsPort,
  ) {}

  async get(user: AuthUser): Promise<AvailabilityResponse> {
    assertMentor(user);
    const settings = await this.mentorSettings.findMentorSettings(user.id);

    if (!settings) {
      throw mentorProfileNotFound();
    }

    const rules = await this.repository.listAvailabilityRules(user.id);

    return {
      timezone: settings.timezone,
      rules: rules.map(toRuleResponse),
    };
  }

  async replace(
    user: AuthUser,
    input: ReplaceAvailabilityInput,
  ): Promise<AvailabilityResponse> {
    assertMentor(user);
    const settings = await this.mentorSettings.findMentorSettings(user.id);

    if (!settings) {
      throw mentorProfileNotFound();
    }

    if (settings.status !== 'approved' || settings.userStatus !== 'active') {
      throw mentorNotApproved();
    }

    const rules = input.rules.map((rule) =>
      normalizeRule(rule, settings.timezone),
    );
    const saved = await this.repository.replaceAvailabilityRules(
      user.id,
      rules,
    );

    return {
      timezone: settings.timezone,
      rules: saved.map(toRuleResponse),
    };
  }
}

function normalizeRule(
  rule: AvailabilityRuleInput,
  defaultTimezone: string,
): AvailabilityRuleData {
  const timezone = rule.timezone ?? defaultTimezone;

  if (!isValidTimeZone(timezone)) {
    throw invalidTimeZone(timezone);
  }

  if (rule.endTime <= rule.startTime) {
    throw invalidAvailabilityRange('endTime must be later than startTime');
  }

  const validFrom = rule.validFrom ? parseDateOnly(rule.validFrom) : null;
  const validTo = rule.validTo ? parseDateOnly(rule.validTo) : null;

  if (validFrom && validTo && validTo.getTime() < validFrom.getTime()) {
    throw invalidAvailabilityRange('validTo must be on or after validFrom');
  }

  return {
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    timezone,
    validFrom,
    validTo,
  };
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw invalidAvailabilityRange(`Invalid date: ${value}`);
  }

  return date;
}

function toRuleResponse(rule: AvailabilityRule): AvailabilityRuleResponse {
  return {
    id: rule.id,
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    timezone: rule.timezone,
    validFrom: rule.validFrom,
    validTo: rule.validTo,
  };
}
