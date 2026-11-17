import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

const RANGE_API = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3_000;

/**
 * Rejects passwords that appear in known data breaches (F2).
 * Uses the Pwned Passwords range API with k-anonymity: only the first 5 hex
 * characters of the SHA-1 are sent. If the service is unreachable the check
 * fails open (the password is accepted and a warning is logged).
 */
@Injectable()
export class PasswordBreachChecker {
  private readonly logger = new Logger(PasswordBreachChecker.name);
  private readonly enabled: boolean;

  constructor(configService: ConfigService) {
    this.enabled =
      configService.get<string>('PASSWORD_BREACH_CHECK') === 'hibp';
  }

  async assertNotBreached(password: string): Promise<void> {
    if (this.enabled && (await this.isBreached(password))) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PASSWORD_BREACHED',
        message: 'This password appeared in a data breach; choose another one',
      });
    }
  }

  async isBreached(password: string): Promise<boolean> {
    const digest = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    try {
      const response = await fetch(`${RANGE_API}${prefix}`, {
        // Padding hides the real number of matches from on-path observers.
        headers: { 'Add-Padding': 'true', 'User-Agent': 'steam-society-api' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn(
        `Password breach check skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }
}
