import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  InvalidMentorStatusTransitionError,
  transitionMentorStatus,
  type MentorStatus,
  type MentorStatusEvent,
} from './domain/mentor-status.js';
import { getOnboardingCompletion } from './onboarding.completion.js';
import {
  getOnboardingConfig,
  getOnboardingQuestionCodes,
  ONBOARDING_VERSION,
  type OnboardingRole,
} from './onboarding.config.js';
import {
  parseOnboardingAnswers,
  type ListMentorsQuery,
  type MenteeAnswers,
  type MenteeProfileUpdateInput,
  type MentorAnswers,
  type MentorProfileUpdateInput,
  type OnboardingUpdateInput,
  type UpdateProfileInput,
} from './profiles.schemas.js';
import {
  ProfilesRepository,
  type AdminMentorRecord,
  type MenteeProfileRecord,
  type MentorProfileRecord,
} from './profiles.repository.js';

const EXPERIENCE_RANGE_YEARS: Record<string, number> = {
  '3-5': 3,
  '6-9': 6,
  '10+': 10,
};

const STAGE_TO_EDUCATION_LEVEL = {
  school: 'school',
  preuniversity: 'other',
  university: 'undergraduate',
  early_career: 'career_change',
} as const;

const STATUS_ACTION: Record<MentorStatusEvent, string> = {
  submit: 'mentor_profile.submitted',
  approve: 'mentor_profile.approved',
  reject: 'mentor_profile.rejected',
  suspend: 'mentor_profile.suspended',
  reactivate: 'mentor_profile.reactivated',
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profiles: ProfilesRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getProfile(user: AuthUser): Promise<{
    role: OnboardingRole;
    profile:
      | ReturnType<typeof toMentorProfile>
      | ReturnType<typeof toMenteeProfile>
      | null;
  }> {
    const role = this.assertProfileRole(user);

    if (role === 'mentor') {
      const profile = await this.profiles.findMentorProfile(user.id);
      return { role, profile: profile ? toMentorProfile(profile) : null };
    }

    const profile = await this.profiles.findMenteeProfile(user.id);
    return { role, profile: profile ? toMenteeProfile(profile) : null };
  }

  async updateProfile(
    user: AuthUser,
    input: UpdateProfileInput,
  ): Promise<{
    role: OnboardingRole;
    profile:
      | ReturnType<typeof toMentorProfile>
      | ReturnType<typeof toMenteeProfile>
      | null;
  }> {
    const role = this.assertProfileRole(user);
    assertProfileFieldsForRole(role, input);

    if (role === 'mentor') {
      const mentorInput = input as MentorProfileUpdateInput;
      await this.applyMentorProfileUpdate(user.id, mentorInput);
    } else {
      const menteeInput = input as MenteeProfileUpdateInput;
      await this.applyMenteeProfileUpdate(user.id, menteeInput);
    }

    return this.getProfile(user);
  }

  async submitMentorProfile(user: AuthUser): Promise<{
    role: 'mentor';
    profile: ReturnType<typeof toMentorProfile>;
  }> {
    const current = await this.profiles.findMentorStatus(user.id);

    if (!current) {
      throw mentorProfileNotFound();
    }

    const next = this.transition(current.status, 'submit');

    const responses = await this.profiles.findOnboardingResponses(
      user.id,
      ONBOARDING_VERSION,
    );
    const completion = getOnboardingCompletion(
      'mentor',
      answersFromResponses('mentor', responses),
    );

    if (!completion.complete) {
      throw onboardingIncomplete(completion.missing);
    }

    await this.profiles.runInTransaction(async (tx) => {
      const count = await this.profiles.updateMentorStatus(
        tx,
        user.id,
        current.status,
        {
          status: next,
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      );

      if (count !== 1) {
        throw mentorStatusConflict();
      }

      await this.profiles.insertAudit(tx, {
        actorUserId: user.id,
        action: STATUS_ACTION.submit,
        entityType: 'mentor_profile',
        entityId: user.id,
        metadata: { from: current.status, to: next },
      });
    });

    const profile = await this.profiles.findMentorProfile(user.id);

    if (!profile) {
      throw mentorProfileNotFound();
    }

    return { role: 'mentor', profile: toMentorProfile(profile) };
  }

  async getOnboarding(
    user: AuthUser,
  ): Promise<ReturnType<typeof buildOnboarding>> {
    const role = this.assertProfileRole(user);
    const [responses, areas, languages] = await Promise.all([
      this.profiles.findOnboardingResponses(user.id, ONBOARDING_VERSION),
      this.profiles.findActiveAreas(),
      this.profiles.findLanguages(),
    ]);

    return buildOnboarding(role, responses, areas, languages);
  }

  async updateOnboarding(
    user: AuthUser,
    input: OnboardingUpdateInput,
  ): Promise<ReturnType<typeof buildOnboarding>> {
    const role = this.assertProfileRole(user);

    if (input.version !== ONBOARDING_VERSION) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ONBOARDING_VERSION_MISMATCH',
        message: `Onboarding version ${input.version} is not supported`,
      });
    }

    const answers = this.parseAnswers(role, input.answers);

    if (role === 'mentor') {
      await this.applyMentorOnboarding(user.id, answers as MentorAnswers);
    } else {
      await this.applyMenteeOnboarding(user.id, answers as MenteeAnswers);
    }

    return this.getOnboarding(user);
  }

  async listMentors(query: ListMentorsQuery): Promise<{
    items: ReturnType<typeof toAdminMentor>[];
    nextCursor: string | null;
  }> {
    const records = await this.profiles.listMentors(
      query.status,
      query.limit,
      query.cursor,
    );
    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;

    return {
      items: page.map(toAdminMentor),
      nextCursor: hasMore ? page[page.length - 1].userId : null,
    };
  }

  async getMentorForAdmin(mentorId: string): Promise<{
    mentor: ReturnType<typeof toAdminMentorDetail>;
    onboarding: ReturnType<typeof buildOnboarding>;
  }> {
    const record = await this.profiles.findAdminMentorById(mentorId);

    if (!record) {
      throw mentorProfileNotFound();
    }

    const [responses, areas, languages] = await Promise.all([
      this.profiles.findOnboardingResponses(mentorId, ONBOARDING_VERSION),
      this.profiles.findActiveAreas(),
      this.profiles.findLanguages(),
    ]);

    return {
      mentor: toAdminMentorDetail(record),
      onboarding: buildOnboarding('mentor', responses, areas, languages),
    };
  }

  approveMentor(
    admin: AuthUser,
    mentorId: string,
  ): Promise<{ role: 'mentor'; profile: ReturnType<typeof toMentorProfile> }> {
    return this.adminTransition(admin, mentorId, 'approve');
  }

  rejectMentor(
    admin: AuthUser,
    mentorId: string,
    reason: string,
  ): Promise<{ role: 'mentor'; profile: ReturnType<typeof toMentorProfile> }> {
    return this.adminTransition(admin, mentorId, 'reject', reason);
  }

  suspendMentor(
    admin: AuthUser,
    mentorId: string,
  ): Promise<{ role: 'mentor'; profile: ReturnType<typeof toMentorProfile> }> {
    return this.adminTransition(admin, mentorId, 'suspend');
  }

  reactivateMentor(
    admin: AuthUser,
    mentorId: string,
  ): Promise<{ role: 'mentor'; profile: ReturnType<typeof toMentorProfile> }> {
    return this.adminTransition(admin, mentorId, 'reactivate');
  }

  private async adminTransition(
    admin: AuthUser,
    mentorId: string,
    event: MentorStatusEvent,
    reason?: string,
  ): Promise<{
    role: 'mentor';
    profile: ReturnType<typeof toMentorProfile>;
  }> {
    const current = await this.profiles.findMentorStatus(mentorId);

    if (!current) {
      throw mentorProfileNotFound();
    }

    const next = this.transition(current.status, event);
    const now = this.clock.now();

    await this.profiles.runInTransaction(async (tx) => {
      const count = await this.profiles.updateMentorStatus(
        tx,
        mentorId,
        current.status,
        {
          status: next,
          reviewedBy: admin.id,
          reviewedAt: now,
          rejectionReason: event === 'reject' ? (reason ?? null) : null,
        },
      );

      if (count !== 1) {
        throw mentorStatusConflict();
      }

      await this.profiles.insertAudit(tx, {
        actorUserId: admin.id,
        action: STATUS_ACTION[event],
        entityType: 'mentor_profile',
        entityId: mentorId,
        metadata: {
          from: current.status,
          to: next,
          ...(reason ? { reason } : {}),
        },
      });
    });

    const profile = await this.profiles.findMentorProfile(mentorId);

    if (!profile) {
      throw mentorProfileNotFound();
    }

    return { role: 'mentor', profile: toMentorProfile(profile) };
  }

  private transition(
    current: MentorStatus,
    event: MentorStatusEvent,
  ): MentorStatus {
    try {
      return transitionMentorStatus(current, event);
    } catch (error) {
      if (error instanceof InvalidMentorStatusTransitionError) {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_MENTOR_STATUS_TRANSITION',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private parseAnswers(
    role: OnboardingRole,
    answers: Record<string, unknown>,
  ): MentorAnswers | MenteeAnswers {
    try {
      return parseOnboardingAnswers(role, answers);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_ONBOARDING_ANSWERS',
          message: 'Onboarding answers are invalid',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }

  private assertProfileRole(user: AuthUser): OnboardingRole {
    if (user.role !== 'mentor' && user.role !== 'mentee') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROFILE_NOT_APPLICABLE',
        message: 'This account does not have a mentor or mentee profile',
      });
    }

    return user.role;
  }

  private async applyMentorProfileUpdate(
    userId: string,
    input: MentorProfileUpdateInput,
  ): Promise<void> {
    const areaIds = input.areaIds
      ? await this.resolveProfileAreas(userId, input.areaIds)
      : undefined;
    const languageCodes = input.languageCodes
      ? await this.validateLanguages(input.languageCodes)
      : undefined;

    await this.profiles.runInTransaction(async (tx) => {
      await this.profiles.upsertMentorProfile(
        userId,
        {
          headline: input.headline,
          bio: input.bio,
          yearsExperience: input.yearsExperience,
          country: input.country,
          city: input.city,
        },
        tx,
      );

      if (areaIds) {
        await this.profiles.replaceMentorAreas(userId, areaIds, tx);
      }

      if (languageCodes) {
        await this.profiles.replaceMentorLanguages(userId, languageCodes, tx);
      }
    });
  }

  private async applyMenteeProfileUpdate(
    userId: string,
    input: MenteeProfileUpdateInput,
  ): Promise<void> {
    const areaIds = input.areaIds
      ? await this.resolveProfileAreas(userId, input.areaIds)
      : undefined;
    const languageCodes = input.languageCodes
      ? await this.validateLanguages(input.languageCodes)
      : undefined;

    await this.profiles.runInTransaction(async (tx) => {
      await this.profiles.upsertMenteeProfile(
        userId,
        {
          goals: input.goals,
          educationLevel: input.careerStage
            ? STAGE_TO_EDUCATION_LEVEL[input.careerStage]
            : input.educationLevel,
          careerStage: input.careerStage,
          country: input.country,
          city: input.city,
        },
        tx,
      );

      if (areaIds) {
        await this.profiles.replaceMenteeInterests(userId, areaIds, tx);
      }

      if (languageCodes) {
        await this.profiles.replaceMenteeLanguages(userId, languageCodes, tx);
      }
    });
  }

  private async applyMentorOnboarding(
    userId: string,
    answers: MentorAnswers,
  ): Promise<void> {
    if (
      answers.primaryAreaId &&
      (!answers.areaIds || answers.areaIds.length === 0)
    ) {
      throw primaryAreaRequiresSubareas();
    }

    const existing = await this.profiles.findMentorProfile(userId);
    const savedPrimaryAreaId = await this.findSavedPrimaryAreaId(userId);
    const areaIds = answers.areaIds
      ? await this.validateAreaHierarchy(
          answers.primaryAreaId ?? savedPrimaryAreaId,
          answers.areaIds,
        )
      : undefined;
    const languageCodes = answers.languageCodes
      ? await this.validateLanguages(answers.languageCodes)
      : undefined;

    await this.profiles.runInTransaction(async (tx) => {
      await this.profiles.upsertMentorProfile(
        userId,
        {
          country: answers.country,
          city: answers.city,
          yearsExperience: answers.experienceRange
            ? EXPERIENCE_RANGE_YEARS[answers.experienceRange]
            : undefined,
        },
        tx,
      );

      if (areaIds) {
        await this.profiles.replaceMentorAreas(userId, areaIds, tx);
      }

      if (languageCodes) {
        await this.profiles.replaceMentorLanguages(userId, languageCodes, tx);
      } else if (!existing || existing.languages.length === 0) {
        await this.profiles.replaceMentorLanguages(userId, ['es'], tx);
      }

      await this.profiles.upsertOnboardingResponses(
        userId,
        answers as Record<string, unknown>,
        ONBOARDING_VERSION,
        tx,
      );
    });
  }

  private async applyMenteeOnboarding(
    userId: string,
    answers: MenteeAnswers,
  ): Promise<void> {
    if (
      answers.primaryAreaId &&
      (!answers.areaIds || answers.areaIds.length === 0)
    ) {
      throw primaryAreaRequiresSubareas();
    }

    const existing = await this.profiles.findMenteeProfile(userId);
    const savedPrimaryAreaId = await this.findSavedPrimaryAreaId(userId);
    const areaIds = answers.areaIds
      ? await this.validateAreaHierarchy(
          answers.primaryAreaId ?? savedPrimaryAreaId,
          answers.areaIds,
        )
      : undefined;
    const languageCodes = answers.languageCodes
      ? await this.validateLanguages(answers.languageCodes)
      : undefined;

    await this.profiles.runInTransaction(async (tx) => {
      await this.profiles.upsertMenteeProfile(
        userId,
        {
          country: answers.country,
          city: answers.city,
          educationLevel: answers.stage
            ? STAGE_TO_EDUCATION_LEVEL[answers.stage]
            : undefined,
          careerStage: answers.stage,
        },
        tx,
      );

      if (areaIds) {
        await this.profiles.replaceMenteeInterests(userId, areaIds, tx);
      }

      if (languageCodes) {
        await this.profiles.replaceMenteeLanguages(userId, languageCodes, tx);
      } else if (!existing || existing.languages.length === 0) {
        await this.profiles.replaceMenteeLanguages(userId, ['es'], tx);
      }

      await this.profiles.upsertOnboardingResponses(
        userId,
        answers as Record<string, unknown>,
        ONBOARDING_VERSION,
        tx,
      );
    });
  }

  private async findSavedPrimaryAreaId(
    userId: string,
  ): Promise<string | undefined> {
    const responses = await this.profiles.findOnboardingResponses(
      userId,
      ONBOARDING_VERSION,
    );
    const answer = responses.find(
      (response) => response.questionCode === 'primaryAreaId',
    )?.answer;

    return typeof answer === 'string' ? answer : undefined;
  }

  private async resolveProfileAreas(
    userId: string,
    areaIds: string[],
  ): Promise<string[]> {
    const primaryAreaId = await this.findSavedPrimaryAreaId(userId);
    const subAreaIds = areaIds.filter((areaId) => areaId !== primaryAreaId);

    return this.validateAreaHierarchy(primaryAreaId, subAreaIds);
  }

  private async validateLanguages(languageCodes: string[]): Promise<string[]> {
    const uniqueCodes = [...new Set(languageCodes)];
    const languages = await this.profiles.findLanguagesByCodes(uniqueCodes);

    if (languages.length !== uniqueCodes.length) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_LANGUAGE',
        message: 'One or more languages do not exist',
      });
    }

    return uniqueCodes;
  }

  private async validateAreaHierarchy(
    primaryAreaId: string | undefined,
    areaIds: string[],
  ): Promise<string[]> {
    if (!primaryAreaId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PRIMARY_AREA_REQUIRED',
        message: 'A primary area is required before selecting sub-areas',
      });
    }

    const uniqueAreaIds = [...new Set(areaIds)];
    const allIds = [...new Set([primaryAreaId, ...uniqueAreaIds])];
    const areas = await this.profiles.findAreasByIds(allIds);
    const byId = new Map(areas.map((area) => [area.id, area]));
    const primary = byId.get(primaryAreaId);

    if (!primary || !primary.active || primary.parentId !== null) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_PRIMARY_AREA',
        message: 'The primary area must be an active root area',
      });
    }

    for (const areaId of uniqueAreaIds) {
      const area = byId.get(areaId);

      if (!area || !area.active || area.parentId !== primaryAreaId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SUBAREA',
          message: 'Every sub-area must be an active child of the primary area',
        });
      }
    }

    return [primaryAreaId, ...uniqueAreaIds];
  }
}

function buildOnboarding(
  role: OnboardingRole,
  responses: Array<{
    questionCode: string;
    answer: unknown;
    version: number;
  }>,
  areas: Array<{ id: string; name: string; parentId: string | null }>,
  languages: Array<{ code: string; name: string }>,
): {
  version: number;
  role: OnboardingRole;
  steps: ReturnType<typeof getOnboardingConfig>['steps'];
  answers: Record<string, unknown>;
  completion: ReturnType<typeof getOnboardingCompletion>;
  options: {
    areas: Array<{ id: string; name: string; parentId: string | null }>;
    languages: Array<{ code: string; name: string }>;
  };
} {
  const config = getOnboardingConfig(role);
  const answers = answersFromResponses(role, responses);

  return {
    ...config,
    answers,
    completion: getOnboardingCompletion(role, answers),
    options: { areas, languages },
  };
}

function answersFromResponses(
  role: OnboardingRole,
  responses: Array<{ questionCode: string; answer: unknown }>,
): Record<string, unknown> {
  const questionCodes = new Set(getOnboardingQuestionCodes(role));

  return Object.fromEntries(
    responses
      .filter((response) => questionCodes.has(response.questionCode))
      .map((response) => [response.questionCode, response.answer]),
  );
}

function toMentorProfile(profile: MentorProfileRecord) {
  return {
    userId: profile.userId,
    headline: profile.headline,
    bio: profile.bio,
    yearsExperience: profile.yearsExperience,
    country: profile.country,
    city: profile.city,
    status: profile.status,
    reviewedAt: profile.reviewedAt,
    rejectionReason: profile.rejectionReason,
    minNoticeHours: profile.minNoticeHours,
    maxAdvanceDays: profile.maxAdvanceDays,
    areas: profile.areas.map(({ area }) => ({
      id: area.id,
      name: area.name,
      parentId: area.parentId,
    })),
    languages: profile.languages.map(({ language }) => ({
      code: language.code,
      name: language.name,
    })),
  };
}

function toMenteeProfile(profile: MenteeProfileRecord) {
  return {
    userId: profile.userId,
    goals: profile.goals,
    educationLevel: profile.educationLevel,
    careerStage: profile.careerStage,
    country: profile.country,
    city: profile.city,
    areas: profile.interests.map(({ area }) => ({
      id: area.id,
      name: area.name,
      parentId: area.parentId,
    })),
    languages: profile.languages.map(({ language }) => ({
      code: language.code,
      name: language.name,
    })),
  };
}

function toAdminMentor(profile: AdminMentorRecord) {
  return {
    userId: profile.userId,
    email: profile.user.email,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    userStatus: profile.user.status,
    headline: profile.headline,
    bio: profile.bio,
    yearsExperience: profile.yearsExperience,
    country: profile.country,
    city: profile.city,
    status: profile.status,
    reviewedAt: profile.reviewedAt,
    rejectionReason: profile.rejectionReason,
    areas: profile.areas.map(({ area }) => ({
      id: area.id,
      name: area.name,
      parentId: area.parentId,
    })),
    languages: profile.languages.map(({ language }) => ({
      code: language.code,
      name: language.name,
    })),
  };
}

function toAdminMentorDetail(profile: AdminMentorRecord) {
  return {
    ...toAdminMentor(profile),
    minNoticeHours: profile.minNoticeHours,
    maxAdvanceDays: profile.maxAdvanceDays,
  };
}

function assertProfileFieldsForRole(
  role: OnboardingRole,
  input: UpdateProfileInput,
): void {
  const keys = Object.keys(input);
  const mentorOnly = ['headline', 'bio', 'yearsExperience'];
  const menteeOnly = ['goals', 'educationLevel', 'careerStage'];
  const forbidden = role === 'mentor' ? menteeOnly : mentorOnly;

  if (keys.some((key) => forbidden.includes(key))) {
    throw new BadRequestException({
      statusCode: 400,
      code: 'PROFILE_FIELD_NOT_ALLOWED',
      message: 'The request contains fields that do not apply to this role',
    });
  }
}

function mentorProfileNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'MENTOR_PROFILE_NOT_FOUND',
    message: 'Mentor profile not found',
  });
}

function mentorStatusConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'MENTOR_STATUS_CONFLICT',
    message: 'The mentor profile changed while processing the request',
  });
}

function primaryAreaRequiresSubareas(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'PRIMARY_AREA_REQUIRES_SUBAREAS',
    message: 'Send areaIds together with a new primary area',
  });
}

function onboardingIncomplete(missing: string[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'ONBOARDING_INCOMPLETE',
    message: 'Complete the required onboarding answers before submitting',
    details: { missing },
  });
}
