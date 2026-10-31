import type { Clock } from '../../src/shared/clock/clock.js';
import type { MentorSettingsPort } from '../../src/modules/scheduling/application/ports/mentor-settings.port.js';
import type { SessionConflictPort } from '../../src/modules/scheduling/application/ports/session-conflict.port.js';
import type {
  AvailabilityRuleData,
  CreateOfferingData,
  SchedulingRepositoryPort,
  UpdateOfferingData,
} from '../../src/modules/scheduling/application/ports/scheduling.repository.js';
import type {
  AvailabilityRule,
  MentorSettings,
} from '../../src/modules/scheduling/domain/availability-rule.js';
import type { Offering } from '../../src/modules/scheduling/domain/offering.js';
import type { BusyInterval } from '../../src/modules/scheduling/domain/slot.js';

const FIXED_NOW = new Date('2026-10-26T12:00:00.000Z');

export class InMemorySchedulingRepository
  implements SchedulingRepositoryPort, MentorSettingsPort
{
  readonly settings = new Map<string, MentorSettings>();
  readonly offerings = new Map<string, Offering>();
  readonly rules = new Map<string, AvailabilityRule[]>();

  private nextOffering = 1;
  private nextRule = 1;

  setMentor(userId: string, overrides: Partial<MentorSettings> = {}): void {
    this.settings.set(userId, {
      status: 'approved',
      userStatus: 'active',
      minNoticeHours: 24,
      maxAdvanceDays: 60,
      timezone: 'America/Lima',
      ...overrides,
    });
  }

  addOffering(overrides: Partial<Offering> & { mentorId: string }): Offering {
    const offering: Offering = {
      id: `offering-${this.nextOffering++}`,
      title: 'Mentoría',
      description: null,
      type: 'one_to_one',
      durationMinutes: 60,
      capacity: 1,
      isFree: true,
      priceMinor: 0,
      currency: 'PEN',
      active: true,
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      ...overrides,
    };

    this.offerings.set(offering.id, offering);
    return offering;
  }

  addRule(
    userId: string,
    overrides: Partial<AvailabilityRule> = {},
  ): AvailabilityRule {
    const rule: AvailabilityRule = {
      id: `rule-${this.nextRule++}`,
      userId,
      weekday: 1,
      startTime: '09:00',
      endTime: '11:00',
      timezone: 'America/Lima',
      validFrom: null,
      validTo: null,
      createdAt: FIXED_NOW,
      ...overrides,
    };
    const rules = this.rules.get(userId) ?? [];
    rules.push(rule);
    this.rules.set(userId, rules);

    return rule;
  }

  async findMentorSettings(userId: string): Promise<MentorSettings | null> {
    return this.settings.get(userId) ?? null;
  }

  async listOfferings(mentorId: string): Promise<Offering[]> {
    return [...this.offerings.values()].filter(
      (offering) => offering.mentorId === mentorId,
    );
  }

  async findOffering(
    mentorId: string,
    offeringId: string,
  ): Promise<Offering | null> {
    const offering = this.offerings.get(offeringId);

    return offering?.mentorId === mentorId ? offering : null;
  }

  async createOffering(data: CreateOfferingData): Promise<Offering> {
    const offering: Offering = {
      id: `offering-${this.nextOffering++}`,
      ...data,
      active: true,
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };

    this.offerings.set(offering.id, offering);
    return offering;
  }

  async updateOffering(
    mentorId: string,
    offeringId: string,
    data: UpdateOfferingData,
  ): Promise<Offering | null> {
    const existing = await this.findOffering(mentorId, offeringId);

    if (!existing) {
      return null;
    }

    const updated: Offering = {
      ...existing,
      ...data,
      updatedAt: FIXED_NOW,
    };

    this.offerings.set(offeringId, updated);
    return updated;
  }

  async archiveOffering(
    mentorId: string,
    offeringId: string,
    archivedAt: Date,
  ): Promise<Offering | null> {
    const existing = await this.findOffering(mentorId, offeringId);

    if (!existing) {
      return null;
    }

    if (!existing.active) {
      return existing;
    }

    const archived: Offering = {
      ...existing,
      active: false,
      archivedAt,
      updatedAt: FIXED_NOW,
    };

    this.offerings.set(offeringId, archived);
    return archived;
  }

  async listAvailabilityRules(userId: string): Promise<AvailabilityRule[]> {
    return [...(this.rules.get(userId) ?? [])];
  }

  async replaceAvailabilityRules(
    userId: string,
    rules: AvailabilityRuleData[],
  ): Promise<AvailabilityRule[]> {
    const saved = rules.map((rule) => ({
      id: `rule-${this.nextRule++}`,
      userId,
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      timezone: rule.timezone,
      validFrom: rule.validFrom
        ? rule.validFrom.toISOString().slice(0, 10)
        : null,
      validTo: rule.validTo ? rule.validTo.toISOString().slice(0, 10) : null,
      createdAt: FIXED_NOW,
    }));

    this.rules.set(userId, saved);
    return saved;
  }

  async findPublicOffering(
    mentorId: string,
    offeringId: string,
  ): Promise<Offering | null> {
    const offering = await this.findOffering(mentorId, offeringId);

    if (!offering || !offering.active || offering.archivedAt) {
      return null;
    }

    return offering;
  }

  async findOfferingById(offeringId: string): Promise<Offering | null> {
    return this.offerings.get(offeringId) ?? null;
  }
}

export class FakeSessionConflictPort implements SessionConflictPort {
  intervals: BusyInterval[] = [];

  async findBusyIntervals(): Promise<BusyInterval[]> {
    return this.intervals;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly date: Date) {}

  now(): Date {
    return this.date;
  }
}
