import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from '../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

/**
 * Profiles and interest questionnaire. On deletion the profile rows stay
 * (offerings, sessions and bookings point to them) but every free-text and
 * personal field is cleared, and a mentor disappears from the catalog.
 */
@Injectable()
export class ProfilesPersonalData
  implements PersonalDataContributor, OnModuleInit
{
  readonly section = 'profile';
  readonly eraseOrder = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async exportFor(userId: string): Promise<unknown> {
    const [mentor, mentee, questionnaire] = await Promise.all([
      this.prisma.mentorProfile.findUnique({
        where: { userId },
        select: {
          headline: true,
          bio: true,
          yearsExperience: true,
          country: true,
          city: true,
          status: true,
          reviewedAt: true,
          rejectionReason: true,
          minNoticeHours: true,
          maxAdvanceDays: true,
          createdAt: true,
          areas: { select: { area: { select: { name: true } } } },
          languages: { select: { languageCode: true } },
        },
      }),
      this.prisma.menteeProfile.findUnique({
        where: { userId },
        select: {
          goals: true,
          educationLevel: true,
          careerStage: true,
          country: true,
          city: true,
          createdAt: true,
          interests: { select: { area: { select: { name: true } } } },
          languages: { select: { languageCode: true } },
        },
      }),
      this.prisma.onboardingResponse.findMany({
        where: { userId },
        select: {
          questionCode: true,
          answer: true,
          version: true,
          createdAt: true,
        },
        orderBy: { questionCode: 'asc' },
      }),
    ]);

    return {
      mentorProfile: mentor && {
        ...mentor,
        areas: mentor.areas.map((item) => item.area.name),
        languages: mentor.languages.map((item) => item.languageCode),
      },
      menteeProfile: mentee && {
        ...mentee,
        interests: mentee.interests.map((item) => item.area.name),
        languages: mentee.languages.map((item) => item.languageCode),
      },
      interestQuestionnaire: questionnaire,
    };
  }

  async erase(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.onboardingResponse.deleteMany({ where: { userId } });

    await tx.mentorArea.deleteMany({ where: { mentorId: userId } });
    await tx.mentorLanguage.deleteMany({ where: { mentorId: userId } });
    await tx.mentorProfile.updateMany({
      where: { userId },
      // Suspended mentors are hidden from the catalog and cannot be booked.
      data: {
        headline: null,
        bio: null,
        yearsExperience: null,
        country: null,
        city: null,
        rejectionReason: null,
        status: 'suspended',
      },
    });

    await tx.menteeInterest.deleteMany({ where: { menteeId: userId } });
    await tx.menteeLanguage.deleteMany({ where: { menteeId: userId } });
    await tx.menteeProfile.updateMany({
      where: { userId },
      data: {
        goals: null,
        educationLevel: null,
        careerStage: null,
        country: null,
        city: null,
      },
    });
  }
}
