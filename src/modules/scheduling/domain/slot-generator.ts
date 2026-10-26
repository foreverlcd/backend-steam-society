import { Temporal } from 'temporal-polyfill';
import type { AvailabilityRule } from './availability-rule.js';
import type { BusyInterval, Slot } from './slot.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const MAX_SLOT_RANGE_DAYS = 90;

export class InvalidSlotRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSlotRangeError';
  }
}

export class SlotRangeTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotRangeTooLargeError';
  }
}

export class InvalidAvailabilityRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvailabilityRuleError';
  }
}

export interface GenerateSlotsInput {
  rules: AvailabilityRule[];
  durationMinutes: number;
  from: Date;
  to: Date;
  now: Date;
  minNoticeHours: number;
  maxAdvanceDays: number;
  busyIntervals?: BusyInterval[];
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const {
    rules,
    durationMinutes,
    from,
    to,
    now,
    minNoticeHours,
    maxAdvanceDays,
    busyIntervals = [],
  } = input;

  assertValidDate(from, 'from');
  assertValidDate(to, 'to');
  assertValidDate(now, 'now');

  if (from.getTime() >= to.getTime()) {
    throw new InvalidSlotRangeError('from must be before to');
  }

  if (to.getTime() - from.getTime() > MAX_SLOT_RANGE_DAYS * DAY_MS) {
    throw new SlotRangeTooLargeError(
      `The slot range cannot exceed ${MAX_SLOT_RANGE_DAYS} days`,
    );
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new InvalidAvailabilityRuleError(
      'durationMinutes must be a positive integer',
    );
  }

  if (!Number.isFinite(minNoticeHours) || minNoticeHours < 0) {
    throw new InvalidAvailabilityRuleError(
      'minNoticeHours must be zero or greater',
    );
  }

  if (!Number.isFinite(maxAdvanceDays) || maxAdvanceDays <= 0) {
    throw new InvalidAvailabilityRuleError(
      'maxAdvanceDays must be greater than zero',
    );
  }

  const windowStartMs = Math.max(
    from.getTime(),
    now.getTime() + minNoticeHours * HOUR_MS,
  );
  const windowEndMs = Math.min(
    to.getTime(),
    now.getTime() + maxAdvanceDays * DAY_MS,
  );

  if (windowStartMs >= windowEndMs) {
    return [];
  }

  const slots = new Map<number, Slot>();

  for (const rule of rules) {
    const startMinutes = parseTimeToMinutes(rule.startTime);
    const endMinutes = parseTimeToMinutes(rule.endTime);

    if (
      !Number.isInteger(rule.weekday) ||
      rule.weekday < 1 ||
      rule.weekday > 7
    ) {
      throw new InvalidAvailabilityRuleError('weekday must be between 1 and 7');
    }

    if (endMinutes <= startMinutes) {
      throw new InvalidAvailabilityRuleError(
        'endTime must be later than startTime',
      );
    }

    if (!rule.timezone) {
      throw new InvalidAvailabilityRuleError('timezone is required');
    }

    const validFrom = rule.validFrom
      ? parsePlainDate(rule.validFrom, 'validFrom')
      : null;
    const validTo = rule.validTo
      ? parsePlainDate(rule.validTo, 'validTo')
      : null;

    if (
      validFrom &&
      validTo &&
      Temporal.PlainDate.compare(validFrom, validTo) > 0
    ) {
      throw new InvalidAvailabilityRuleError(
        'validTo must be on or after validFrom',
      );
    }

    let firstDate: Temporal.PlainDate;
    let lastDate: Temporal.PlainDate;

    try {
      firstDate = Temporal.Instant.fromEpochMilliseconds(windowStartMs)
        .toZonedDateTimeISO(rule.timezone)
        .toPlainDate()
        .subtract({ days: 1 });
      lastDate = Temporal.Instant.fromEpochMilliseconds(windowEndMs)
        .toZonedDateTimeISO(rule.timezone)
        .toPlainDate()
        .add({ days: 1 });
    } catch {
      throw new InvalidAvailabilityRuleError(
        `Invalid time zone: ${rule.timezone}`,
      );
    }

    for (
      let date = firstDate;
      Temporal.PlainDate.compare(date, lastDate) <= 0;
      date = date.add({ days: 1 })
    ) {
      if (date.dayOfWeek !== rule.weekday) {
        continue;
      }

      if (validFrom && Temporal.PlainDate.compare(date, validFrom) < 0) {
        continue;
      }

      if (validTo && Temporal.PlainDate.compare(date, validTo) > 0) {
        continue;
      }

      for (
        let minutes = startMinutes;
        minutes + durationMinutes <= endMinutes;
        minutes += durationMinutes
      ) {
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const expectedStart = Temporal.PlainTime.from({ hour, minute });

        let zonedStart: Temporal.ZonedDateTime;

        try {
          zonedStart = Temporal.ZonedDateTime.from(
            {
              timeZone: rule.timezone,
              year: date.year,
              month: date.month,
              day: date.day,
              hour,
              minute,
              second: 0,
              millisecond: 0,
            },
            { disambiguation: 'compatible' },
          );
        } catch {
          throw new InvalidAvailabilityRuleError(
            `Invalid time zone: ${rule.timezone}`,
          );
        }

        // A gap in a DST transition is shifted by Temporal. The slot is not
        // valid at the requested local time, so it is skipped instead of
        // silently moving the appointment.
        if (
          Temporal.PlainTime.compare(
            zonedStart.toPlainTime(),
            expectedStart,
          ) !== 0
        ) {
          continue;
        }

        const zonedEnd = zonedStart.add({ minutes: durationMinutes });
        const startMs = Number(zonedStart.epochMilliseconds);
        const endMs = Number(zonedEnd.epochMilliseconds);

        if (startMs < windowStartMs || endMs > windowEndMs) {
          continue;
        }

        if (overlapsBusyInterval(startMs, endMs, busyIntervals)) {
          continue;
        }

        if (!slots.has(startMs)) {
          slots.set(startMs, {
            startsAt: new Date(startMs),
            endsAt: new Date(endMs),
            timezone: rule.timezone,
            localStart: formatLocalDateTime(zonedStart.toPlainDateTime()),
            localEnd: formatLocalDateTime(zonedEnd.toPlainDateTime()),
          });
        }
      }
    }
  }

  return [...slots.values()].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  );
}

function parseTimeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    throw new InvalidAvailabilityRuleError(
      `Invalid local time: ${value}. Expected HH:mm`,
    );
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function parsePlainDate(value: string, field: string): Temporal.PlainDate {
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    throw new InvalidAvailabilityRuleError(`Invalid ${field}: ${value}`);
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidSlotRangeError(`${field} must be a valid date`);
  }
}

function overlapsBusyInterval(
  startMs: number,
  endMs: number,
  busyIntervals: BusyInterval[],
): boolean {
  return busyIntervals.some(
    (busy) =>
      startMs < busy.endsAt.getTime() && endMs > busy.startsAt.getTime(),
  );
}

function formatLocalDateTime(value: Temporal.PlainDateTime): string {
  return value.toString({ smallestUnit: 'minute' });
}
