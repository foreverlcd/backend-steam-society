import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return the health status', () => {
    // Ejecuta la ruta check() tal cual esta en el controlador
    const result = controller.check();

    // Comprueba que responde lo que se puso en el health.service.ts
    expect(result.status).toBe('ok');
    expect(result.message).toBe('STEAM Society API is running');
    expect(result.timestamp).toBeDefined();
  });
});
