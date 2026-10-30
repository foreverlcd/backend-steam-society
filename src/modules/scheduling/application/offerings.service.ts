import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import type { Offering } from '../domain/offering.js';
import { assertMentor } from './assert-mentor.js';
import {
  MENTOR_SETTINGS_PORT,
  type MentorSettingsPort,
} from './ports/mentor-settings.port.js';
import {
  SCHEDULING_REPOSITORY,
  type SchedulingRepositoryPort,
  type UpdateOfferingData,
} from './ports/scheduling.repository.js';
import {
  invalidCurrency,
  invalidOfferingPrice,
  mentorNotApproved,
  mentorProfileNotFound,
  offeringArchived,
  offeringNotFound,
} from './scheduling.errors.js';
import type {
  CreateOfferingInput,
  UpdateOfferingInput,
} from './scheduling.inputs.js';

const DEFAULT_CURRENCY = 'PEN';
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export interface OfferingResponse {
  id: string;
  mentorId: string;
  title: string;
  description: string | null;
  type: 'one_to_one' | 'group';
  durationMinutes: number;
  capacity: number;
  isFree: boolean;
  priceMinor: number;
  currency: string;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OfferingsService {
  constructor(
    @Inject(SCHEDULING_REPOSITORY)
    private readonly repository: SchedulingRepositoryPort,
    @Inject(MENTOR_SETTINGS_PORT)
    private readonly mentorSettings: MentorSettingsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listOwn(user: AuthUser): Promise<{ items: OfferingResponse[] }> {
    assertMentor(user);
    const offerings = await this.repository.listOfferings(user.id);

    return { items: offerings.map(toOfferingResponse) };
  }

  async create(
    user: AuthUser,
    input: CreateOfferingInput,
  ): Promise<OfferingResponse> {
    assertMentor(user);
    await this.assertApprovedMentor(user.id);

    const currency = (input.currency ?? DEFAULT_CURRENCY).toUpperCase();
    validateCurrency(currency);
    const priceMinor = normalizePrice(input.isFree, input.priceMinor);

    const offering = await this.repository.createOffering({
      mentorId: user.id,
      title: input.title,
      description: input.description ?? null,
      type: 'one_to_one',
      durationMinutes: input.durationMinutes,
      capacity: 1,
      isFree: input.isFree,
      priceMinor,
      currency,
    });

    return toOfferingResponse(offering);
  }

  async update(
    user: AuthUser,
    offeringId: string,
    input: UpdateOfferingInput,
  ): Promise<OfferingResponse> {
    assertMentor(user);
    await this.assertApprovedMentor(user.id);

    const existing = await this.repository.findOffering(user.id, offeringId);

    if (!existing) {
      throw offeringNotFound();
    }

    if (!existing.active) {
      throw offeringArchived();
    }

    const isFree = input.isFree ?? existing.isFree;
    const priceMinor = normalizePrice(
      isFree,
      input.priceMinor ?? existing.priceMinor,
      input.priceMinor !== undefined,
    );
    const currency = (input.currency ?? existing.currency).toUpperCase();
    validateCurrency(currency);

    const data: UpdateOfferingData = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes }
        : {}),
      isFree,
      priceMinor,
      currency,
    };

    const updated = await this.repository.updateOffering(
      user.id,
      offeringId,
      data,
    );

    if (!updated) {
      throw offeringNotFound();
    }

    return toOfferingResponse(updated);
  }

  async archive(user: AuthUser, offeringId: string): Promise<OfferingResponse> {
    assertMentor(user);

    const existing = await this.repository.findOffering(user.id, offeringId);

    if (!existing) {
      throw offeringNotFound();
    }

    if (!existing.active) {
      return toOfferingResponse(existing);
    }

    const archived = await this.repository.archiveOffering(
      user.id,
      offeringId,
      this.clock.now(),
    );

    if (!archived) {
      throw offeringNotFound();
    }

    return toOfferingResponse(archived);
  }

  private async assertApprovedMentor(userId: string): Promise<void> {
    const settings = await this.mentorSettings.findMentorSettings(userId);

    if (!settings) {
      throw mentorProfileNotFound();
    }

    if (settings.status !== 'approved' || settings.userStatus !== 'active') {
      throw mentorNotApproved();
    }
  }
}

function normalizePrice(
  isFree: boolean,
  priceMinor: number | undefined,
  priceWasProvided = priceMinor !== undefined,
): number {
  if (isFree) {
    if (priceWasProvided && priceMinor !== 0) {
      throw invalidOfferingPrice();
    }

    return 0;
  }

  if (priceMinor === undefined || priceMinor <= 0) {
    throw invalidOfferingPrice();
  }

  return priceMinor;
}

function validateCurrency(currency: string): void {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw invalidCurrency();
  }
}

function toOfferingResponse(offering: Offering): OfferingResponse {
  return {
    id: offering.id,
    mentorId: offering.mentorId,
    title: offering.title,
    description: offering.description,
    type: offering.type,
    durationMinutes: offering.durationMinutes,
    capacity: offering.capacity,
    isFree: offering.isFree,
    priceMinor: offering.priceMinor,
    currency: offering.currency,
    active: offering.active,
    archivedAt: offering.archivedAt?.toISOString() ?? null,
    createdAt: offering.createdAt.toISOString(),
    updatedAt: offering.updatedAt.toISOString(),
  };
}
