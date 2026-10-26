import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  FakeSessionConflictPort,
  FixedClock,
  InMemorySchedulingRepository,
} from '../../../../test/helpers/scheduling.fakes.js';
import { SlotsService } from './slots.service.js';

const NOW = new Date('2026-10-25T00:00:00.000Z');
const FROM = '2026-10-26T00:00:00.000Z';
const TO = '2026-10-27T00:00:00.000Z';

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the promise to reject');
}

describe('SlotsService', () => {
  let repository: InMemorySchedulingRepository;
  let sessionConflict: FakeSessionConflictPort;
  let service: SlotsService;

  beforeEach(() => {
    repository = new InMemorySchedulingRepository();
    sessionConflict = new FakeSessionConflictPort();
    service = new SlotsService(
      repository,
      repository,
      sessionConflict,
      new FixedClock(NOW),
    );
  });

  function seedPublicOffering() {
    repository.setMentor('mentor-1', {
      status: 'approved',
      minNoticeHours: 0,
      maxAdvanceDays: 60,
      timezone: 'America/Lima',
    });
    const offering = repository.addOffering({
      mentorId: 'mentor-1',
      durationMinutes: 60,
      isFree: true,
      priceMinor: 0,
    });
    repository.addRule('mentor-1', {
      weekday: 1,
      startTime: '09:00',
      endTime: '11:00',
      timezone: 'America/Lima',
    });

    return offering;
  }

  it('returns public slots with UTC instants and local labels', async () => {
    const offering = seedPublicOffering();

    const result = await service.getPublicSlots('mentor-1', {
      offeringId: offering.id,
      from: FROM,
      to: TO,
    });

    expect(result).toEqual({
      mentorId: 'mentor-1',
      offeringId: offering.id,
      durationMinutes: 60,
      slots: [
        {
          startsAt: '2026-10-26T14:00:00.000Z',
          endsAt: '2026-10-26T15:00:00.000Z',
          timezone: 'America/Lima',
          localStart: '2026-10-26T09:00',
          localEnd: '2026-10-26T10:00',
        },
        {
          startsAt: '2026-10-26T15:00:00.000Z',
          endsAt: '2026-10-26T16:00:00.000Z',
          timezone: 'America/Lima',
          localStart: '2026-10-26T10:00',
          localEnd: '2026-10-26T11:00',
        },
      ],
    });
  });

  it('removes slots that overlap a session returned by the port', async () => {
    const offering = seedPublicOffering();
    sessionConflict.intervals = [
      {
        startsAt: new Date('2026-10-26T14:30:00.000Z'),
        endsAt: new Date('2026-10-26T14:45:00.000Z'),
      },
    ];

    const result = await service.getPublicSlots('mentor-1', {
      offeringId: offering.id,
      from: FROM,
      to: TO,
    });

    expect(result.slots.map((slot) => slot.localStart)).toEqual([
      '2026-10-26T10:00',
    ]);
  });

  it('hides offerings from mentors that are not approved', async () => {
    const offering = seedPublicOffering();
    repository.setMentor('mentor-1', {
      status: 'pending_review',
      minNoticeHours: 0,
      maxAdvanceDays: 60,
      timezone: 'America/Lima',
    });

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: FROM,
        to: TO,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'OFFERING_NOT_FOUND',
    });
  });

  it('hides slots when the account is suspended', async () => {
    const offering = seedPublicOffering();
    repository.setMentor('mentor-1', {
      status: 'approved',
      userStatus: 'suspended',
      minNoticeHours: 0,
      maxAdvanceDays: 60,
      timezone: 'America/Lima',
    });

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: FROM,
        to: TO,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'OFFERING_NOT_FOUND',
    });
  });

  it('hides archived offerings', async () => {
    const offering = repository.addOffering({
      mentorId: 'mentor-1',
      active: false,
      archivedAt: NOW,
    });

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: FROM,
        to: TO,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'OFFERING_NOT_FOUND',
    });
  });

  it('does not expose another mentor offering', async () => {
    const offering = repository.addOffering({ mentorId: 'mentor-2' });

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: FROM,
        to: TO,
      }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('rejects an invalid range', async () => {
    const offering = seedPublicOffering();

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: TO,
        to: FROM,
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_SLOT_RANGE',
    });
  });

  it('rejects a range larger than the maximum', async () => {
    const offering = seedPublicOffering();

    const error = await captureError(
      service.getPublicSlots('mentor-1', {
        offeringId: offering.id,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'SLOT_RANGE_TOO_LARGE',
    });
  });
});
