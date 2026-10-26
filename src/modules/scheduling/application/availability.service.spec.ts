import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types.js';
import { InMemorySchedulingRepository } from '../../../../test/helpers/scheduling.fakes.js';
import { AvailabilityService } from './availability.service.js';

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

describe('AvailabilityService', () => {
  let repository: InMemorySchedulingRepository;
  let service: AvailabilityService;

  beforeEach(() => {
    repository = new InMemorySchedulingRepository();
    service = new AvailabilityService(repository, repository);
  });

  it('returns the mentor timezone and saved rules', async () => {
    repository.setMentor('mentor-1', { timezone: 'America/Lima' });
    repository.addRule('mentor-1', {
      weekday: 3,
      startTime: '14:00',
      endTime: '16:00',
      timezone: 'America/Lima',
    });

    const result = await service.get(authUser());

    expect(result).toMatchObject({
      timezone: 'America/Lima',
      rules: [
        {
          weekday: 3,
          startTime: '14:00',
          endTime: '16:00',
          timezone: 'America/Lima',
          validFrom: null,
          validTo: null,
        },
      ],
    });
  });

  it('uses the mentor timezone when a rule omits it', async () => {
    repository.setMentor('mentor-1', { timezone: 'America/Lima' });

    const result = await service.replace(authUser(), {
      rules: [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '12:00',
          validFrom: '2026-11-01',
          validTo: '2026-12-01',
        },
      ],
    });

    expect(result).toMatchObject({
      timezone: 'America/Lima',
      rules: [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '12:00',
          timezone: 'America/Lima',
          validFrom: '2026-11-01',
          validTo: '2026-12-01',
        },
      ],
    });
    expect(repository.rules.get('mentor-1')).toHaveLength(1);
  });

  it('replaces all rules, including clearing them', async () => {
    repository.setMentor('mentor-1');
    repository.addRule('mentor-1');

    await service.replace(authUser(), { rules: [] });

    expect(repository.rules.get('mentor-1')).toEqual([]);
  });

  it('requires an approved mentor to replace availability', async () => {
    repository.setMentor('mentor-1', { status: 'pending_review' });

    const error = await captureError(
      service.replace(authUser(), {
        rules: [{ weekday: 1, startTime: '09:00', endTime: '10:00' }],
      }),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_NOT_APPROVED',
    });
  });

  it('reports a missing mentor profile', async () => {
    const error = await captureError(service.get(authUser()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'MENTOR_PROFILE_NOT_FOUND',
    });
  });

  it('rejects an invalid IANA timezone', async () => {
    repository.setMentor('mentor-1');

    const error = await captureError(
      service.replace(authUser(), {
        rules: [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '10:00',
            timezone: 'Not/AZone',
          },
        ],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_TIMEZONE',
    });
  });

  it('rejects an end time before the start time', async () => {
    repository.setMentor('mentor-1');

    const error = await captureError(
      service.replace(authUser(), {
        rules: [{ weekday: 1, startTime: '10:00', endTime: '09:00' }],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_AVAILABILITY_RANGE',
    });
  });

  it('rejects an impossible calendar date', async () => {
    repository.setMentor('mentor-1');

    const error = await captureError(
      service.replace(authUser(), {
        rules: [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '10:00',
            validFrom: '2026-02-30',
          },
        ],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_AVAILABILITY_RANGE',
    });
  });

  it('rejects a validity range that ends before it starts', async () => {
    repository.setMentor('mentor-1');

    const error = await captureError(
      service.replace(authUser(), {
        rules: [
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '10:00',
            validFrom: '2026-12-01',
            validTo: '2026-11-01',
          },
        ],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_AVAILABILITY_RANGE',
    });
  });

  it('rejects mentees', async () => {
    const error = await captureError(service.get(authUser({ role: 'mentee' })));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'MENTOR_ONLY',
    });
  });
});
