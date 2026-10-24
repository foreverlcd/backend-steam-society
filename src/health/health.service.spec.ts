import { Logger, ServiceUnavailableException } from '@nestjs/common';
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('recovers and returns ok after the database comes back', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('logs only the error name and Prisma code', async () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const error = Object.assign(
      new Error(
        'connect postgresql://steam:secret@127.0.0.1:5433/steam_society failed',
      ),
      { name: 'PrismaClientKnownRequestError', code: 'P1001' },
    );
    prismaMock.$queryRaw.mockRejectedValue(error);

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(loggerSpy).toHaveBeenCalledOnce();
    expect(loggerSpy.mock.calls[0]?.[0]).toBe(
      'Database health check failed: PrismaClientKnownRequestError (P1001)',
    );
    expect(String(loggerSpy.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('logs only the error name when there is no Prisma code', async () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(loggerSpy).toHaveBeenCalledOnce();
    expect(loggerSpy.mock.calls[0]?.[0]).toBe(
      'Database health check failed: Error',
    );
  });
});
