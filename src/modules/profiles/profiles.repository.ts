import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { MentorStatus } from './domain/mentor-status.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

const mentorInclude = {
  areas: { include: { area: true } },
  languages: { include: { language: true } },
} satisfies Prisma.MentorProfileInclude;

const menteeInclude = {
  interests: { include: { area: true } },
  languages: { include: { language: true } },
} satisfies Prisma.MenteeProfileInclude;

const adminMentorInclude = {
  ...mentorInclude,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
} satisfies Prisma.MentorProfileInclude;

const publicMentorInclude = {
  ...mentorInclude,
  user: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.MentorProfileInclude;

const matchingMenteeInclude = {
  ...menteeInclude,
  user: { select: { timezone: true } },
} satisfies Prisma.MenteeProfileInclude;

const matchingMentorInclude = {
  ...mentorInclude,
  user: {
    select: {
      firstName: true,
      lastName: true,
      status: true,
      timezone: true,
    },
  },
} satisfies Prisma.MentorProfileInclude;

export type MentorProfileRecord = Prisma.MentorProfileGetPayload<{
  include: typeof mentorInclude;
}>;

export type MenteeProfileRecord = Prisma.MenteeProfileGetPayload<{
  include: typeof menteeInclude;
}>;

export type AdminMentorRecord = Prisma.MentorProfileGetPayload<{
  include: typeof adminMentorInclude;
}>;

export type PublicMentorRecord = Prisma.MentorProfileGetPayload<{
  include: typeof publicMentorInclude;
}>;

export type MatchingMenteeRecord = Prisma.MenteeProfileGetPayload<{
  include: typeof matchingMenteeInclude;
}>;

export type MatchingMentorRecord = Prisma.MentorProfileGetPayload<{
  include: typeof matchingMentorInclude;
}>;

export interface PublicMentorSearchData {
  q?: string;
  areaId?: string;
  language?: string;
  country?: string;
  isFree?: boolean;
  maxPriceMinor?: number;
  currency: string;
  limit: number;
  cursor?: { rank: number; userId: string };
}

export interface MentorProfileData {
  headline?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  country?: string | null;
  city?: string | null;
}

export interface MenteeProfileData {
  goals?: string | null;
  educationLevel?:
    'school' | 'undergraduate' | 'graduate' | 'career_change' | 'other' | null;
  careerStage?:
    'school' | 'preuniversity' | 'university' | 'early_career' | null;
  country?: string | null;
  city?: string | null;
}

export interface AuditInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Prisma.InputJsonValue;
}

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findMentorProfile(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MentorProfileRecord | null> {
    return (tx ?? this.prisma).mentorProfile.findUnique({
      where: { userId },
      include: mentorInclude,
    });
  }

  findMenteeProfile(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MenteeProfileRecord | null> {
    return (tx ?? this.prisma).menteeProfile.findUnique({
      where: { userId },
      include: menteeInclude,
    });
  }

  findAdminMentorById(userId: string): Promise<AdminMentorRecord | null> {
    return this.prisma.mentorProfile.findUnique({
      where: { userId },
      include: adminMentorInclude,
    });
  }

  findMentorStatus(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ status: MentorStatus } | null> {
    return (tx ?? this.prisma).mentorProfile.findUnique({
      where: { userId },
      select: { status: true },
    });
  }

  async findMentorSchedulingSettings(userId: string): Promise<{
    status: MentorStatus;
    userStatus: 'pending_verification' | 'active' | 'suspended' | 'deleted';
    minNoticeHours: number;
    maxAdvanceDays: number;
    timezone: string;
  } | null> {
    const record = await this.prisma.mentorProfile.findUnique({
      where: { userId },
      select: {
        status: true,
        minNoticeHours: true,
        maxAdvanceDays: true,
        user: { select: { timezone: true, status: true } },
      },
    });

    if (!record) {
      return null;
    }

    return {
      status: record.status,
      userStatus: record.user.status,
      minNoticeHours: record.minNoticeHours,
      maxAdvanceDays: record.maxAdvanceDays,
      timezone: record.user.timezone,
    };
  }

  upsertMentorProfile(
    userId: string,
    data: MentorProfileData,
    tx?: Prisma.TransactionClient,
  ): Promise<MentorProfileRecord> {
    const db = tx ?? this.prisma;

    return db.mentorProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      include: mentorInclude,
    });
  }

  upsertMenteeProfile(
    userId: string,
    data: MenteeProfileData,
    tx?: Prisma.TransactionClient,
  ): Promise<MenteeProfileRecord> {
    const db = tx ?? this.prisma;

    return db.menteeProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      include: menteeInclude,
    });
  }

  async replaceMentorAreas(
    userId: string,
    areaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.mentorArea.deleteMany({ where: { mentorId: userId } });

    if (areaIds.length > 0) {
      await db.mentorArea.createMany({
        data: areaIds.map((areaId) => ({ mentorId: userId, areaId })),
        skipDuplicates: true,
      });
    }
  }

  async replaceMenteeInterests(
    userId: string,
    areaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.menteeInterest.deleteMany({ where: { menteeId: userId } });

    if (areaIds.length > 0) {
      await db.menteeInterest.createMany({
        data: areaIds.map((areaId) => ({ menteeId: userId, areaId })),
        skipDuplicates: true,
      });
    }
  }

  async replaceMentorLanguages(
    userId: string,
    languageCodes: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.mentorLanguage.deleteMany({ where: { mentorId: userId } });

    if (languageCodes.length > 0) {
      await db.mentorLanguage.createMany({
        data: languageCodes.map((languageCode) => ({
          mentorId: userId,
          languageCode,
        })),
        skipDuplicates: true,
      });
    }
  }

  async replaceMenteeLanguages(
    userId: string,
    languageCodes: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.menteeLanguage.deleteMany({ where: { menteeId: userId } });

    if (languageCodes.length > 0) {
      await db.menteeLanguage.createMany({
        data: languageCodes.map((languageCode) => ({
          menteeId: userId,
          languageCode,
        })),
        skipDuplicates: true,
      });
    }
  }

  findOnboardingResponses(
    userId: string,
    version?: number,
  ): Promise<
    Array<{ questionCode: string; answer: Prisma.JsonValue; version: number }>
  > {
    return this.prisma.onboardingResponse.findMany({
      where: { userId, ...(version ? { version } : {}) },
      select: { questionCode: true, answer: true, version: true },
      orderBy: { questionCode: 'asc' },
    });
  }

  async upsertOnboardingResponses(
    userId: string,
    answers: Record<string, unknown>,
    version: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    for (const [questionCode, answer] of Object.entries(answers)) {
      if (answer === undefined) {
        continue;
      }

      const value = answer as Prisma.InputJsonValue;

      await db.onboardingResponse.upsert({
        where: { userId_questionCode: { userId, questionCode } },
        update: { answer: value, version },
        create: { userId, questionCode, answer: value, version },
      });
    }
  }

  findActiveAreas(): Promise<
    Array<{ id: string; name: string; parentId: string | null }>
  > {
    return this.prisma.area.findMany({
      where: { active: true },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });
  }

  findLanguages(): Promise<Array<{ code: string; name: string }>> {
    return this.prisma.language.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  findAreasByIds(ids: string[]): Promise<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      active: boolean;
    }>
  > {
    return this.prisma.area.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, parentId: true, active: true },
    });
  }

  findLanguagesByCodes(
    codes: string[],
  ): Promise<Array<{ code: string; name: string }>> {
    return this.prisma.language.findMany({
      where: { code: { in: codes } },
      select: { code: true, name: true },
    });
  }

  listMentors(
    status: MentorStatus | undefined,
    limit: number,
    cursor: string | undefined,
  ): Promise<AdminMentorRecord[]> {
    return this.prisma.mentorProfile.findMany({
      where: status ? { status } : undefined,
      include: adminMentorInclude,
      orderBy: { userId: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
    });
  }

  async searchPublicMentors(data: PublicMentorSearchData): Promise<{
    records: PublicMentorRecord[];
    nextCursor: { rank: number; userId: string } | null;
  }> {
    const q = data.q?.trim();
    const rank = q
      ? Prisma.sql`GREATEST(
          ts_rank_cd(mp."search_vector", websearch_to_tsquery('spanish', ${q})),
          similarity(coalesce(mp."headline", ''), ${q}),
          similarity(coalesce(mp."bio", ''), ${q}) * 0.5
        )::double precision`
      : Prisma.sql`0::double precision`;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`mp."status" = 'approved'`,
      Prisma.sql`u."status" = 'active'`,
    ];

    if (q) {
      conditions.push(Prisma.sql`(
        mp."search_vector" @@ websearch_to_tsquery('spanish', ${q})
        OR similarity(coalesce(mp."headline", ''), ${q}) >= 0.2
        OR similarity(coalesce(mp."bio", ''), ${q}) >= 0.2
        OR similarity(coalesce(mp."city", ''), ${q}) >= 0.2
        OR EXISTS (
          SELECT 1
          FROM "mentor_area" ma
          JOIN "area" a ON a."id" = ma."area_id"
          WHERE ma."mentor_id" = mp."user_id"
            AND similarity(a."name", ${q}) >= 0.2
        )
      )`);
    }

    if (data.areaId) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "mentor_area" ma
        WHERE ma."mentor_id" = mp."user_id" AND ma."area_id" = ${data.areaId}::uuid
      )`);
    }

    if (data.language) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "mentor_language" ml
        WHERE ml."mentor_id" = mp."user_id" AND ml."language_code" = ${data.language}
      )`);
    }

    if (data.country) {
      conditions.push(Prisma.sql`mp."country" = ${data.country}`);
    }

    if (data.isFree) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "offering" o
        WHERE o."mentor_id" = mp."user_id"
          AND o."active" = true
          AND o."archived_at" IS NULL
          AND o."is_free" = true
      )`);
    }

    if (data.maxPriceMinor !== undefined) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "offering" o
        WHERE o."mentor_id" = mp."user_id"
          AND o."active" = true
          AND o."archived_at" IS NULL
          AND o."price_minor" <= ${data.maxPriceMinor}
          AND o."currency" = ${data.currency}
      )`);
    }

    const where = Prisma.join(conditions, ' AND ');
    const cursorCondition = data.cursor
      ? Prisma.sql`WHERE (ranked."rank" < ${data.cursor.rank})
          OR (ranked."rank" = ${data.cursor.rank} AND ranked."userId" > ${data.cursor.userId})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string; rank: number }>
    >`
      WITH ranked AS (
        SELECT mp."user_id" AS "userId", ${rank} AS "rank"
        FROM "mentor_profile" mp
        JOIN "user" u ON u."id" = mp."user_id"
        WHERE ${where}
      )
      SELECT "userId", "rank"
      FROM ranked
      ${cursorCondition}
      ORDER BY "rank" DESC, "userId" ASC
      LIMIT ${data.limit + 1}
    `;

    const hasMore = rows.length > data.limit;
    const page = hasMore ? rows.slice(0, data.limit) : rows;
    const last = page[page.length - 1];
    const records =
      page.length === 0
        ? []
        : await this.prisma.mentorProfile.findMany({
            where: { userId: { in: page.map((row) => row.userId) } },
            include: publicMentorInclude,
          });
    const byId = new Map(records.map((record) => [record.userId, record]));
    const ordered = page
      .map((row) => byId.get(row.userId))
      .filter((record): record is PublicMentorRecord => Boolean(record));

    return {
      records: ordered,
      nextCursor:
        hasMore && last
          ? { rank: last.rank, userId: last.userId }
          : null,
    };
  }

  findPublicMentor(userId: string): Promise<PublicMentorRecord | null> {
    return this.prisma.mentorProfile.findFirst({
      where: {
        userId,
        status: 'approved',
        user: { status: 'active' },
      },
      include: publicMentorInclude,
    });
  }

  findMenteeMatchingProfile(
    userId: string,
  ): Promise<MatchingMenteeRecord | null> {
    return this.prisma.menteeProfile.findUnique({
      where: { userId },
      include: matchingMenteeInclude,
    });
  }

  listMatchingMentorCandidates(): Promise<MatchingMentorRecord[]> {
    return this.prisma.mentorProfile.findMany({
      where: {
        status: 'approved',
        user: { status: 'active' },
      },
      include: matchingMentorInclude,
      orderBy: { userId: 'asc' },
    });
  }

  async updateMentorStatus(
    tx: Prisma.TransactionClient,
    userId: string,
    expectedStatus: MentorStatus,
    data: {
      status: MentorStatus;
      reviewedBy: string | null;
      reviewedAt: Date | null;
      rejectionReason: string | null;
    },
  ): Promise<number> {
    const result = await tx.mentorProfile.updateMany({
      where: { userId, status: expectedStatus },
      data,
    });

    return result.count;
  }

  async insertAudit(
    tx: Prisma.TransactionClient,
    input: AuditInput,
  ): Promise<void> {
    await tx.auditLog.create({ data: input });
  }
}
