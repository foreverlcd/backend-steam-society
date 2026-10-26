import { Temporal } from 'temporal-polyfill';
import {
  generateSlots,
  InvalidAvailabilityRuleError,
  InvalidSlotRangeError,
  MAX_SLOT_RANGE_DAYS,
  SlotRangeTooLargeError,
  type GenerateSlotsInput,
} from './slot-generator.js';
import type { AvailabilityRule } from './availability-rule.js';
import type { BusyInterval } from './slot.js';

const LIMA = 'America/Lima';
const NEW_YORK = 'America/New_York';

function rule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: 'rule-1',
    userId: 'mentor-1',
    weekday: 1,
    startTime: '09:00',
    endTime: '11:00',
    timezone: LIMA,
    validFrom: null,
    validTo: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function generate(overrides: Partial<GenerateSlotsInput> = {}) {
  return generateSlots({
    rules: [rule()],
    durationMinutes: 60,
    from: new Date('2026-10-26T00:00:00.000Z'),
    to: new Date('2026-10-27T00:00:00.000Z'),
    now: new Date('2026-10-25T00:00:00.000Z'),
    minNoticeHours: 0,
    maxAdvanceDays: 60,
    busyIntervals: [],
    ...overrides,
  });
}

function iso(date: Date): string {
  return date.toISOString();
}

describe('generateSlots', () => {
  it('generates consecutive slots inside a weekly rule', () => {
    const slots = generate();

    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => iso(slot.startsAt))).toEqual([
      '2026-10-26T14:00:00.000Z',
      '2026-10-26T15:00:00.000Z',
    ]);
    expect(slots.map((slot) => iso(slot.endsAt))).toEqual([
      '2026-10-26T15:00:00.000Z',
      '2026-10-26T16:00:00.000Z',
    ]);
    expect(slots[0]).toMatchObject({
      timezone: LIMA,
      localStart: '2026-10-26T09:00',
      localEnd: '2026-10-26T10:00',
    });
  });

  it('respects the minimum notice window', () => {
    const slots = generate({
      now: new Date('2026-10-26T00:00:00.000Z'),
      minNoticeHours: 24,
      from: new Date('2026-10-26T00:00:00.000Z'),
      to: new Date('2026-11-03T00:00:00.000Z'),
    });

    expect(slots.map((slot) => iso(slot.startsAt))).toEqual([
      '2026-11-02T14:00:00.000Z',
      '2026-11-02T15:00:00.000Z',
    ]);
  });

  it('respects the maximum advance window', () => {
    const slots = generate({
      now: new Date('2026-10-26T00:00:00.000Z'),
      minNoticeHours: 0,
      maxAdvanceDays: 7,
      from: new Date('2026-10-27T00:00:00.000Z'),
      to: new Date('2026-11-03T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('skips local times that do not exist when DST starts', () => {
    const slots = generate({
      rules: [
        rule({
          weekday: 7,
          startTime: '01:00',
          endTime: '04:00',
          timezone: NEW_YORK,
        }),
      ],
      from: new Date('2026-03-08T00:00:00.000Z'),
      to: new Date('2026-03-09T00:00:00.000Z'),
      now: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(slots.map((slot) => slot.localStart)).toEqual([
      '2026-03-08T01:00',
      '2026-03-08T03:00',
    ]);
    expect(slots.map((slot) => iso(slot.startsAt))).toEqual([
      '2026-03-08T06:00:00.000Z',
      '2026-03-08T07:00:00.000Z',
    ]);
  });

  it('uses the earlier offset for an ambiguous local time without duplicating it', () => {
    const slots = generate({
      rules: [
        rule({
          weekday: 7,
          startTime: '00:00',
          endTime: '04:00',
          timezone: NEW_YORK,
        }),
      ],
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      now: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(slots.map((slot) => slot.localStart)).toEqual([
      '2026-11-01T00:00',
      '2026-11-01T01:00',
      '2026-11-01T02:00',
      '2026-11-01T03:00',
    ]);
    expect(new Set(slots.map((slot) => slot.startsAt.getTime())).size).toBe(4);
    expect(slots[1]).toMatchObject({
      localEnd: '2026-11-01T01:00',
    });
    expect(iso(slots[1].endsAt)).toBe('2026-11-01T06:00:00.000Z');
  });

  it('excludes slots that overlap a busy interval', () => {
    const busyIntervals: BusyInterval[] = [
      {
        startsAt: new Date('2026-10-26T14:30:00.000Z'),
        endsAt: new Date('2026-10-26T15:30:00.000Z'),
      },
    ];

    const slots = generate({
      rules: [rule({ endTime: '12:00' })],
      busyIntervals,
    });

    expect(slots.map((slot) => slot.localStart)).toEqual(['2026-10-26T11:00']);
  });

  it('deduplicates slots produced by overlapping rules', () => {
    const slots = generate({
      rules: [rule(), rule({ id: 'rule-2' })],
    });

    expect(slots).toHaveLength(2);
  });

  it('returns no slots when there are no rules', () => {
    expect(generate({ rules: [] })).toEqual([]);
  });

  it('throws for an invalid range and for a range that is too large', () => {
    expect(() =>
      generate({
        from: new Date('2026-10-27T00:00:00.000Z'),
        to: new Date('2026-10-26T00:00:00.000Z'),
      }),
    ).toThrow(InvalidSlotRangeError);

    expect(() =>
      generate({
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date(
          new Date('2026-01-01T00:00:00.000Z').getTime() +
            (MAX_SLOT_RANGE_DAYS + 1) * 24 * 60 * 60 * 1000,
        ),
      }),
    ).toThrow(SlotRangeTooLargeError);
  });

  it('throws for an invalid time zone', () => {
    expect(() =>
      generate({ rules: [rule({ timezone: 'Not/AZone' })] }),
    ).toThrow(InvalidAvailabilityRuleError);
  });

  it('keeps every slot inside a rule and outside every busy interval', () => {
    const random = seededRandom(20261026);
    const timezones = [LIMA, NEW_YORK, 'Europe/Madrid'];

    for (let iteration = 0; iteration < 80; iteration += 1) {
      const timezone = timezones[Math.floor(random() * timezones.length)];
      const weekday = 1 + Math.floor(random() * 7);
      const startMinutes = Math.floor(random() * 12) * 60;
      const durationMinutes = 15 * (1 + Math.floor(random() * 8));
      const endMinutes = Math.min(
        startMinutes + durationMinutes * 3,
        23 * 60 + 59,
      );
      const currentRule = rule({
        weekday,
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        timezone,
      });
      const now = new Date('2026-01-01T00:00:00.000Z');
      const from = new Date(
        now.getTime() + Math.floor(random() * 30) * 24 * 60 * 60 * 1000,
      );
      const to = new Date(
        from.getTime() + (1 + Math.floor(random() * 20)) * 24 * 60 * 60 * 1000,
      );
      const busyIntervals = Array.from(
        { length: Math.floor(random() * 4) },
        () => {
          const start = new Date(
            from.getTime() + Math.floor(random() * 20 * 24 * 60) * 60 * 1000,
          );
          return {
            startsAt: start,
            endsAt: new Date(
              start.getTime() + (15 + Math.floor(random() * 120)) * 60 * 1000,
            ),
          };
        },
      );
      const slots = generateSlots({
        rules: [currentRule],
        durationMinutes,
        from,
        to,
        now,
        minNoticeHours: 0,
        maxAdvanceDays: 60,
        busyIntervals,
      });

      for (const slot of slots) {
        expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(
          durationMinutes * 60 * 1000,
        );
        expect(slot.startsAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
        expect(slot.endsAt.getTime()).toBeLessThanOrEqual(to.getTime());

        for (const busy of busyIntervals) {
          const overlaps =
            slot.startsAt.getTime() < busy.endsAt.getTime() &&
            slot.endsAt.getTime() > busy.startsAt.getTime();
          expect(overlaps).toBe(false);
        }

        const localStart = Temporal.Instant.fromEpochMilliseconds(
          slot.startsAt.getTime(),
        ).toZonedDateTimeISO(timezone);
        expect(localStart.dayOfWeek).toBe(weekday);
        expect(localStart.hour * 60 + localStart.minute).toBeGreaterThanOrEqual(
          startMinutes,
        );
        expect(localStart.hour * 60 + localStart.minute).toBeLessThan(
          endMinutes,
        );
      }
    }
  });
});

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
