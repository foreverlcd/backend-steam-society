import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AvailabilityRule } from '../domain/availability-rule.js';
import type { Offering } from '../domain/offering.js';
import type {
  AvailabilityRuleData,
  CreateOfferingData,
  SchedulingRepositoryPort,
  UpdateOfferingData,
} from '../application/ports/scheduling.repository.js';

type OfferingRecord = Prisma.OfferingGetPayload<{}>;
type AvailabilityRuleRecord = Prisma.AvailabilityRuleGetPayload<{}>;

@Injectable()
export class PrismaSchedulingRepository implements SchedulingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listOfferings(mentorId: string): Promise<Offering[]> {
    const records = await this.prisma.offering.findMany({
      where: { mentorId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toOffering);
  }

  async findOffering(
    mentorId: string,
    offeringId: string,
  ): Promise<Offering | null> {
    const record = await this.prisma.offering.findFirst({
      where: { id: offeringId, mentorId },
    });

    return record ? toOffering(record) : null;
  }

  async createOffering(data: CreateOfferingData): Promise<Offering> {
    const record = await this.prisma.offering.create({ data });

    return toOffering(record);
  }

  async updateOffering(
    mentorId: string,
    offeringId: string,
    data: UpdateOfferingData,
  ): Promise<Offering | null> {
    const result = await this.prisma.offering.updateMany({
      where: { id: offeringId, mentorId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    const record = await this.prisma.offering.findUnique({
      where: { id: offeringId },
    });

    return record ? toOffering(record) : null;
  }

  async archiveOffering(
    mentorId: string,
    offeringId: string,
    archivedAt: Date,
  ): Promise<Offering | null> {
    const result = await this.prisma.offering.updateMany({
      where: { id: offeringId, mentorId, active: true },
      data: { active: false, archivedAt },
    });

    if (result.count === 0) {
      const existing = await this.prisma.offering.findFirst({
        where: { id: offeringId, mentorId },
      });

      return existing ? toOffering(existing) : null;
    }

    const record = await this.prisma.offering.findUnique({
      where: { id: offeringId },
    });

    return record ? toOffering(record) : null;
  }

  async listAvailabilityRules(userId: string): Promise<AvailabilityRule[]> {
    const records = await this.prisma.availabilityRule.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });

    return records.map(toAvailabilityRule);
  }

  async replaceAvailabilityRules(
    userId: string,
    rules: AvailabilityRuleData[],
  ): Promise<AvailabilityRule[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({ where: { userId } });

      if (rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: rules.map((rule) => ({
            userId,
            weekday: rule.weekday,
            startTime: parseTime(rule.startTime),
            endTime: parseTime(rule.endTime),
            timezone: rule.timezone,
            validFrom: rule.validFrom,
            validTo: rule.validTo,
          })),
        });
      }

      const records = await tx.availabilityRule.findMany({
        where: { userId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      });

      return records.map(toAvailabilityRule);
    });
  }

  async findPublicOffering(
    mentorId: string,
    offeringId: string,
  ): Promise<Offering | null> {
    const record = await this.prisma.offering.findFirst({
      where: {
        id: offeringId,
        mentorId,
        active: true,
        archivedAt: null,
      },
    });

    return record ? toOffering(record) : null;
  }
}

function toOffering(record: OfferingRecord): Offering {
  return {
    id: record.id,
    mentorId: record.mentorId,
    title: record.title,
    description: record.description,
    type: record.type,
    durationMinutes: record.durationMinutes,
    capacity: record.capacity,
    isFree: record.isFree,
    priceMinor: record.priceMinor,
    currency: record.currency,
    active: record.active,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAvailabilityRule(record: AvailabilityRuleRecord): AvailabilityRule {
  return {
    id: record.id,
    userId: record.userId,
    weekday: record.weekday,
    startTime: formatTime(record.startTime),
    endTime: formatTime(record.endTime),
    timezone: record.timezone,
    validFrom: toDateOnly(record.validFrom),
    validTo: toDateOnly(record.validTo),
    createdAt: record.createdAt,
  };
}

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function formatTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}
