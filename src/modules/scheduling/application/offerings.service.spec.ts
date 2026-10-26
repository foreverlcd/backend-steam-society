import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types.js';
import {
  FixedClock,
  InMemorySchedulingRepository,
} from '../../../../test/helpers/scheduling.fakes.js';
import { OfferingsService } from './offerings.service.js';

const NOW = new Date('2026-10-26T12:00:00.000Z');

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'mentor-1',
    email: 'mentor@example.com',
    role: 'mentor',
    status: 'active',
    firstName: 'Ada',
    lastName: 'Lovelace',
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the promise to reject');
}

describe('OfferingsService', () => {
  let repository: InMemorySchedulingRepository;
  let service: OfferingsService;

  beforeEach(() => {
    repository = new InMemorySchedulingRepository();
    service = new OfferingsService(repository, repository, new FixedClock(NOW));
  });

  it('lists only the mentor own offerings', async () => {
    repository.setMentor('mentor-1');
    repository.addOffering({ mentorId: 'mentor-1', title: 'Mine' });
    repository.addOffering({ mentorId: 'mentor-2', title: 'Other' });

    const result = await service.listOwn(authUser());

    expect(result.items.map((item) => item.title)).toEqual(['Mine']);
  });

  it('rejects mentees even if they reach the service directly', async () => {
    const error = await captureError(
      service.listOwn(authUser({ role: 'mentee' })),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_ONLY',
    });
  });

  it('creates a free offering with the default currency and capacity', async () => {
    repository.setMentor('mentor-1');

    const result = await service.create(authUser(), {
      title: 'Primera mentoría',
      description: 'Una conversación inicial',
      durationMinutes: 60,
      isFree: true,
    });

    expect(result).toMatchObject({
      mentorId: 'mentor-1',
      title: 'Primera mentoría',
      description: 'Una conversación inicial',
      type: 'one_to_one',
      durationMinutes: 60,
      capacity: 1,
      isFree: true,
      priceMinor: 0,
      currency: 'PEN',
      active: true,
      archivedAt: null,
    });
    expect(repository.offerings.size).toBe(1);
  });

  it('creates a paid offering with an explicit currency', async () => {
    repository.setMentor('mentor-1');

    const result = await service.create(authUser(), {
      title: 'Mentoría de portafolio',
      durationMinutes: 90,
      isFree: false,
      priceMinor: 5000,
      currency: 'USD',
    });

    expect(result).toMatchObject({
      isFree: false,
      priceMinor: 5000,
      currency: 'USD',
    });
  });

  it('rejects inconsistent free/paid prices', async () => {
    repository.setMentor('mentor-1');

    const freeWithPrice = await captureError(
      service.create(authUser(), {
        title: 'Free',
        durationMinutes: 60,
        isFree: true,
        priceMinor: 100,
      }),
    );
    expect(freeWithPrice).toBeInstanceOf(BadRequestException);
    expect((freeWithPrice as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_OFFERING_PRICE',
    });

    const paidWithoutPrice = await captureError(
      service.create(authUser(), {
        title: 'Paid',
        durationMinutes: 60,
        isFree: false,
      }),
    );
    expect(paidWithoutPrice).toBeInstanceOf(BadRequestException);
    expect(
      (paidWithoutPrice as BadRequestException).getResponse(),
    ).toMatchObject({ code: 'INVALID_OFFERING_PRICE' });
  });

  it('requires an approved mentor profile to create or update', async () => {
    repository.setMentor('mentor-1', { status: 'pending_review' });

    const createError = await captureError(
      service.create(authUser(), {
        title: 'Mentoría',
        durationMinutes: 60,
        isFree: true,
      }),
    );
    expect(createError).toBeInstanceOf(ForbiddenException);
    expect((createError as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_NOT_APPROVED',
    });

    const offering = repository.addOffering({ mentorId: 'mentor-1' });
    const updateError = await captureError(
      service.update(authUser(), offering.id, { title: 'Nuevo título' }),
    );
    expect(updateError).toBeInstanceOf(ForbiddenException);
    expect((updateError as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_NOT_APPROVED',
    });
  });

  it('requires an active account to create offerings', async () => {
    repository.setMentor('mentor-1', {
      status: 'approved',
      userStatus: 'suspended',
    });

    const error = await captureError(
      service.create(authUser(), {
        title: 'Mentoría',
        durationMinutes: 60,
        isFree: true,
      }),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_NOT_APPROVED',
    });
  });

  it('reports a missing mentor profile', async () => {
    const error = await captureError(
      service.create(authUser(), {
        title: 'Mentoría',
        durationMinutes: 60,
        isFree: true,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'MENTOR_PROFILE_NOT_FOUND',
    });
  });

  it('updates a paid offering and can switch it to free', async () => {
    repository.setMentor('mentor-1');
    const offering = repository.addOffering({
      mentorId: 'mentor-1',
      isFree: false,
      priceMinor: 5000,
      currency: 'USD',
    });

    const updated = await service.update(authUser(), offering.id, {
      title: 'Título actualizado',
      isFree: true,
    });

    expect(updated).toMatchObject({
      title: 'Título actualizado',
      isFree: true,
      priceMinor: 0,
      currency: 'USD',
    });
  });

  it('rejects switching a free offering to paid without a price', async () => {
    repository.setMentor('mentor-1');
    const offering = repository.addOffering({
      mentorId: 'mentor-1',
      isFree: true,
      priceMinor: 0,
    });

    const error = await captureError(
      service.update(authUser(), offering.id, { isFree: false }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_OFFERING_PRICE',
    });
  });

  it('rejects updating an archived offering', async () => {
    repository.setMentor('mentor-1');
    const offering = repository.addOffering({
      mentorId: 'mentor-1',
      active: false,
      archivedAt: NOW,
    });

    const error = await captureError(
      service.update(authUser(), offering.id, { title: 'No' }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'OFFERING_ARCHIVED',
    });
  });

  it('does not let a mentor update another mentor offering', async () => {
    repository.setMentor('mentor-1');
    const offering = repository.addOffering({ mentorId: 'mentor-2' });

    const error = await captureError(
      service.update(authUser(), offering.id, { title: 'No' }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'OFFERING_NOT_FOUND',
    });
  });

  it('archives idempotently and records the archive timestamp', async () => {
    repository.setMentor('mentor-1');
    const offering = repository.addOffering({ mentorId: 'mentor-1' });

    const archived = await service.archive(authUser(), offering.id);

    expect(archived).toMatchObject({
      active: false,
      archivedAt: NOW.toISOString(),
    });

    const again = await service.archive(authUser(), offering.id);

    expect(again).toMatchObject({
      active: false,
      archivedAt: NOW.toISOString(),
    });
  });
});
