import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  const healthMock = { check: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthMock }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('delegates the check to HealthService', async () => {
    healthMock.check.mockResolvedValue({ status: 'ok', db: 'up' });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(healthMock.check).toHaveBeenCalledOnce();
  });
});
