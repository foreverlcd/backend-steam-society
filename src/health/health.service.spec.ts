import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  const prismaMock = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('returns ok when the database responds', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
  });

  it('throws 503 when the database fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const error = await service.check().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      db: 'down',
    });
  });
});
