import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IceServer,
  IceServersPort,
} from '../application/ports/call-signaling.port.js';

const TURN_TTL_SECONDS = 4 * 3600;
const TURN_TIMEOUT_MS = 5_000;

/**
 * Public STUN always; Cloudflare TURN when configured, with credentials
 * generated per call so they cannot be reused for long.
 */
@Injectable()
export class CloudflareIceServers implements IceServersPort {
  private readonly logger = new Logger(CloudflareIceServers.name);
  private readonly stun: IceServer[];
  private readonly turnKeyId?: string;
  private readonly turnToken?: string;

  constructor(config: ConfigService) {
    const urls = (config.get<string>('CALL_STUN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    this.stun = urls.length > 0 ? [{ urls }] : [];
    this.turnKeyId = config.get<string>('CALL_TURN_KEY_ID');
    this.turnToken = config.get<string>('CALL_TURN_API_TOKEN');
  }

  async forCall(): Promise<IceServer[]> {
    if (!this.turnKeyId || !this.turnToken) return this.stun;
    try {
      const turn = await this.generateTurn(this.turnKeyId, this.turnToken);
      return [...this.stun, ...turn];
    } catch (error) {
      // STUN alone still connects most calls.
      this.logger.warn(
        `TURN credentials unavailable: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
      return this.stun;
    }
  }

  private async generateTurn(
    keyId: string,
    token: string,
  ): Promise<IceServer[]> {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`TURN_HTTP_${response.status}`);
    const body = (await response.json()) as { iceServers?: unknown };
    const list = Array.isArray(body.iceServers)
      ? body.iceServers
      : [body.iceServers];

    return list.flatMap((entry): IceServer[] => {
      if (!entry || typeof entry !== 'object') return [];
      const server = entry as {
        urls?: string | string[];
        username?: string;
        credential?: string;
      };
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls])
        .filter((url): url is string => typeof url === 'string')
        // Browsers block port 53; those entries only slow ICE down.
        .filter((url) => !/:53(\?|$)/.test(url));
      if (urls.length === 0) return [];
      return [
        { urls, username: server.username, credential: server.credential },
      ];
    });
  }
}
