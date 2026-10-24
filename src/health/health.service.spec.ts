import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be return the health status object', () => {
    const result = service.check();
    expect(result.status).toBe('ok');
    expect(result.message).toBe('STEAM Society API is running');
    expect(result.timestamp).toBeDefined();
  });
});
