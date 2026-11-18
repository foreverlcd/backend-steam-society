import { createHmac, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IceServer,
  IceServersPort,
} from '../application/ports/call-signaling.port.js';

const TURN_TTL_SECONDS = 4 * 3600;
const TURN_TIMEOUT_MS = 5_000;

/**
 * Public STUN always, plus TURN when configured: our own coturn (TURN REST
 * shared secret, ADR-028) and/or Cloudflare Realtime. Credentials are made
 * per call and expire, so a leaked one cannot be reused for long.
 */
@Injectable()
export class ConfiguredIceServers implements IceServersPort {
  private readonly logger = new Logger(ConfiguredIceServers.name);
  private readonly stun: IceServer[];
  private readonly coturnUrls: string[];
  private readonly coturnSecret?: string;
  private readonly turnKeyId?: string;
  private readonly turnToken?: string;

  constructor(config: ConfigService) {
    const urls = (config.get<string>('CALL_STUN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    this.stun = urls.length > 0 ? [{ urls }] : [];
    this.coturnUrls = (config.get<string>('CALL_TURN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    this.coturnSecret = config.get<string>('CALL_TURN_SHARED_SECRET');
    this.turnKeyId = config.get<string>('CALL_TURN_KEY_ID');
    this.turnToken = config.get<string>('CALL_TURN_API_TOKEN');
  }

  async forCall(): Promise<IceServer[]> {
    const servers = [...this.stun, ...this.coturn()];
    if (!this.turnKeyId || !this.turnToken) return servers;
    try {
      const turn = await this.generateTurn(this.turnKeyId, this.turnToken);
      return [...servers, ...turn];
    } catch (error) {
      // STUN (and coturn, if set) still connect most calls.
      this.logger.warn(
        `TURN credentials unavailable: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
      return servers;
    }
  }

  /**
   * coturn `use-auth-secret`: the username carries its expiry time and the
   * password is HMAC-SHA1(secret, username), so coturn checks it offline.
   */
  private coturn(): IceServer[] {
    if (!this.coturnSecret || this.coturnUrls.length === 0) return [];
    const expiresAt = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
    const username = `${expiresAt}:${randomUUID()}`;
    const credential = createHmac('sha1', this.coturnSecret)
      .update(username)
      .digest('base64');
    return [{ urls: this.coturnUrls, username, credential }];
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
