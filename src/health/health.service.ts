import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service.js';

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
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = this.getPrismaCode(error);
    return code ? `${name} (${code})` : name;
  }

  private getPrismaCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const { code, errorCode } = error as {
      code?: unknown;
      errorCode?: unknown;
    };

    for (const candidate of [code, errorCode]) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }

    return undefined;
  }
}
