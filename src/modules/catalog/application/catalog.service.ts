import { Inject, Injectable } from '@nestjs/common';
import {
  ProfilesService,
  type PublicMentorProfile,
} from '../../profiles/profiles.service.js';
import {
  SCHEDULING_REPOSITORY,
  type SchedulingRepositoryPort,
} from '../../scheduling/application/ports/scheduling.repository.js';
import type { Offering } from '../../scheduling/domain/offering.js';
import type { PublicMentorQuery } from '../../profiles/profiles.schemas.js';

export interface PublicOffering {
  id: string;
  title: string;
  description: string | null;
  type: 'one_to_one' | 'group';
  durationMinutes: number;
  capacity: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
}

export interface CatalogMentor extends PublicMentorProfile {
  offerings: PublicOffering[];
}

export interface CatalogPage {
  items: CatalogMentor[];
  nextCursor: string | null;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly profiles: ProfilesService,
    @Inject(SCHEDULING_REPOSITORY)
    private readonly scheduling: SchedulingRepositoryPort,
  ) {}

  async list(query: PublicMentorQuery): Promise<CatalogPage> {
    const result = await this.profiles.searchPublicMentors(query);
    const offerings = await this.scheduling.listActiveOfferingsForMentors(
      result.items.map((mentor) => mentor.userId),
    );
    const byMentor = groupBy(offerings, (offering) => offering.mentorId);

    return {
      items: result.items.map((mentor) => ({
        ...mentor,
        offerings: (byMentor.get(mentor.userId) ?? []).map(toPublicOffering),
      })),
      nextCursor: result.nextCursor,
    };
  }

  async get(mentorId: string): Promise<CatalogMentor> {
    const mentor = await this.profiles.getPublicMentor(mentorId);
    const offerings = await this.scheduling.listActiveOfferingsForMentors([
      mentorId,
    ]);

    return {
      ...mentor,
      offerings: offerings.map(toPublicOffering),
    };
  }
}

function toPublicOffering(offering: Offering): PublicOffering {
  return {
    id: offering.id,
    title: offering.title,
    description: offering.description,
    type: offering.type,
    durationMinutes: offering.durationMinutes,
    capacity: offering.capacity,
    isFree: offering.isFree,
    priceMinor: offering.priceMinor,
    currency: offering.currency,
  };
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey);

    if (group) {
      group.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }

  return groups;
}
