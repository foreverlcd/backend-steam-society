import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseWebOrigins } from './shared/config/web-origins.js';

export function configureApp(app: INestApplication): void {
  // NestJS 12.1+: Helmet defaults, including removal of X-Powered-By.
  app.useSecurityHeaders();

  const configService = app.get(ConfigService);
  const webOrigins = parseWebOrigins(configService.get<string>('WEB_ORIGIN'));

  app.enableCors({ origin: webOrigins.length > 0 ? webOrigins : false });
}
