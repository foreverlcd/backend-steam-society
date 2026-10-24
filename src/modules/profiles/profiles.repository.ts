import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
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

export type MentorProfileRecord = Prisma.MentorProfileGetPayload<{
  include: typeof mentorInclude;
}>;

export type MenteeProfileRecord = Prisma.MenteeProfileGetPayload<{
  include: typeof menteeInclude;
}>;

export type AdminMentorRecord = Prisma.MentorProfileGetPayload<{
  include: typeof adminMentorInclude;
}>;

export interface MentorProfileData {
  headline?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  country?: string | null;
  city?: string | null;
}

export interface MenteeProfileData {
  goals?: string | null;
  educationLevel?: 'school' | 'undergraduate' | 'graduate' | 'career_change' | 'other' | null;
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

  findMentorStatus(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ status: MentorStatus } | null> {
    return (tx ?? this.prisma).mentorProfile.findUnique({
      where: { userId },
      select: { status: true },
    });
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
    Array<{ id: string; name: string; parentId: string | null; active: boolean }>
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
