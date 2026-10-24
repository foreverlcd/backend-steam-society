import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service.js';

const CONNECTION_STRING_PATTERN = /postgres(?:ql)?:\/\/\S+/gi;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch (error) {
      this.logger.error(
        `Database health check failed: ${this.describeError(error)}`,
      );
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }

  private describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(CONNECTION_STRING_PATTERN, '[redacted]');
  }
}
