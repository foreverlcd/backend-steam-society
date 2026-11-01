import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/clock/clock.js';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  ProfilesService,
  type MenteeMatchingProfile,
  type MatchingMentorCandidate,
} from '../../profiles/profiles.service.js';
import {
  SCHEDULING_REPOSITORY,
  type SchedulingRepositoryPort,
} from '../../scheduling/application/ports/scheduling.repository.js';
import {
  SESSION_CONFLICT_PORT,
  type MentorBusyInterval,
  type SessionConflictPort,
} from '../../scheduling/application/ports/session-conflict.port.js';
import type { AvailabilityRule } from '../../scheduling/domain/availability-rule.js';
import type { Offering } from '../../scheduling/domain/offering.js';
import {
  generateSlots,
  InvalidAvailabilityRuleError,
} from '../../scheduling/domain/slot-generator.js';
import { MATCHING_CONFIG } from '../domain/matching.config.js';
import { recommend } from '../domain/recommend.js';
import type {
  MatchingConfig,
  MenteeSignals,
  MentorAvailabilitySlot,
  MentorCandidate,
  MentorOffering,
  Recommendation,
} from '../domain/matching.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecommendationsResponse {
  items: Recommendation[];
  meta: {
    totalCandidates: number;
    eligibleCandidates: number;
    horizonDays: number;
    limit: number;
  };
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly profiles: ProfilesService,
    @Inject(SCHEDULING_REPOSITORY)
    private readonly scheduling: SchedulingRepositoryPort,
    @Inject(SESSION_CONFLICT_PORT)
    private readonly sessionConflict: SessionConflictPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MATCHING_CONFIG) private readonly config: MatchingConfig,
  ) {}

  async getRecommendations(
    user: AuthUser,
    limit?: number,
  ): Promise<RecommendationsResponse> {
    if (user.role !== 'mentee') {
      throw recommendationsMenteeOnly();
    }

    const mentee = await this.profiles.getMenteeMatchingProfile(user.id);

    if (!mentee) {
      throw menteeProfileRequired();
    }

    const candidates = await this.profiles.listMatchingMentorCandidates();
    const now = this.clock.now();
    const to = new Date(
      now.getTime() + this.config.horizonDays * DAY_MS,
    );
    const mentorIds = candidates.map((candidate) => candidate.userId);
    const [offerings, rules, busyIntervals] = await Promise.all([
      this.scheduling.listActiveOfferingsForMentors(mentorIds),
      this.scheduling.listAvailabilityRulesForUsers(mentorIds),
      this.sessionConflict.findBusyIntervalsForMentors(
        mentorIds,
        now,
        to,
      ),
    ]);
    const offeringsByMentor = groupBy(
      offerings,
      (offering) => offering.mentorId,
    );
    const rulesByMentor = groupBy(rules, (rule) => rule.userId);
    const busyByMentor = groupBy(
      busyIntervals,
      (interval) => interval.mentorId,
    );
    const matchingCandidates = candidates.map((candidate) =>
      toMatchingCandidate(
        candidate,
        offeringsByMentor.get(candidate.userId) ?? [],
        rulesByMentor.get(candidate.userId) ?? [],
        busyByMentor.get(candidate.userId) ?? [],
        now,
        to,
        this.config,
      ),
    );
    const recommendations = recommend({
      mentee: toMenteeSignals(mentee),
      candidates: matchingCandidates,
      config: this.config,
    });
    const requestedLimit = limit ?? this.config.defaultLimit;

    return {
      items: recommendations.slice(0, requestedLimit),
      meta: {
        totalCandidates: candidates.length,
        eligibleCandidates: recommendations.length,
        horizonDays: this.config.horizonDays,
        limit: requestedLimit,
      },
    };
  }
}

function toMenteeSignals(mentee: MenteeMatchingProfile): MenteeSignals {
  return {
    userId: mentee.userId,
    timezone: mentee.timezone,
    areas: mentee.areas,
    languages: mentee.languages,
    careerStage: mentee.careerStage,
    currentLevel: mentee.currentLevel,
    availabilityPreferences: mentee.availabilityPreferences,
    onlyFree: mentee.onlyFree,
    maxPriceMinor: mentee.maxPriceMinor,
  };
}

function toMatchingCandidate(
  candidate: MatchingMentorCandidate,
  offerings: Offering[],
  rules: AvailabilityRule[],
  busyIntervals: MentorBusyInterval[],
  now: Date,
  to: Date,
  config: MatchingConfig,
): MentorCandidate {
  return {
    userId: candidate.userId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    headline: candidate.headline,
    bio: candidate.bio,
    yearsExperience: candidate.yearsExperience,
    country: candidate.country,
    city: candidate.city,
    status: candidate.status,
    userStatus: candidate.userStatus,
    areas: candidate.areas,
    languages: candidate.languages,
    offerings: offerings.map(toMentorOffering),
    availability: buildAvailability(
      candidate,
      offerings,
      rules,
      busyIntervals,
      now,
      to,
      config,
    ),
  };
}

function buildAvailability(
  candidate: MatchingMentorCandidate,
  offerings: Offering[],
  rules: AvailabilityRule[],
  busyIntervals: MentorBusyInterval[],
  now: Date,
  to: Date,
  config: MatchingConfig,
): MentorAvailabilitySlot[] {
  if (offerings.length === 0 || rules.length === 0) {
    return [];
  }

  // The shortest active offering is the most permissive proxy for "has a
  // bookable slot". The exact offering is still chosen by the mentee later.
  const shortest = offerings.reduce((current, offering) =>
    offering.durationMinutes < current.durationMinutes ? offering : current,
  );

  try {
    return generateSlots({
      rules,
      durationMinutes: shortest.durationMinutes,
      from: now,
      to,
      now,
      minNoticeHours: candidate.minNoticeHours,
      maxAdvanceDays: Math.min(candidate.maxAdvanceDays, config.horizonDays),
      busyIntervals,
    }).map((slot) => ({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: slot.timezone,
    }));
  } catch (error) {
    if (error instanceof InvalidAvailabilityRuleError) {
      // A malformed stored rule must not break the whole recommendation list.
      return [];
    }

    throw error;
  }
}

function toMentorOffering(offering: Offering): MentorOffering {
  return {
    id: offering.id,
    title: offering.title,
    isFree: offering.isFree,
    priceMinor: offering.priceMinor,
    currency: offering.currency,
    durationMinutes: offering.durationMinutes,
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

function recommendationsMenteeOnly(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'RECOMMENDATIONS_MENTEE_ONLY',
    message: 'Recommendations are only available to mentees',
  });
}

function menteeProfileRequired(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'MENTEE_PROFILE_REQUIRED',
    message: 'Complete your mentee profile before requesting recommendations',
  });
}
