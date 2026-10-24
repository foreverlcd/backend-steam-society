import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { parseWebOrigins } from './shared/config/web-origins.js';
import { resolveSessionCookieName } from './shared/http/session-cookie.js';

const PgSession = connectPgSimple(session);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function configureApp(app: INestApplication): void {
  // NestJS 12.1+: Helmet defaults, including removal of X-Powered-By.
  app.useSecurityHeaders();

  const configService = app.get(ConfigService);
  const webOrigins = parseWebOrigins(configService.get<string>('WEB_ORIGIN'));

  // CORS must run before CSRF so rejected cross-origin requests still carry
  // the CORS headers the browser needs to expose the error.
  app.enableCors({
    origin: webOrigins.length > 0 ? webOrigins : false,
    credentials: webOrigins.length > 0,
  });
  app.enableCsrfProtection({ trustedOrigins: webOrigins });

  const store = new PgSession({
    conString: configService.getOrThrow<string>('DATABASE_URL'),
    tableName: 'auth_session',
    createTableIfMissing: false,
    pruneSessionInterval: 900,
  });

  const secureCookie =
    configService.get<string>('SESSION_COOKIE_SECURE') !== 'false';

  app.use(
    session({
      store,
      secret: configService.getOrThrow<string>('SESSION_SECRET'),
      name: resolveSessionCookieName(secureCookie),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      },
    }),
  );

  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
}
