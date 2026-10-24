import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      message: 'STEAM Society API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
