import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { parseWebOrigins } from './shared/config/web-origins.js';
import {
  resolveSessionCookieName,
  SESSION_TTL_MS,
} from './shared/http/session-cookie.js';

const PgSession = connectPgSimple(session);

export function configureApp(app: INestApplication): void {
  // NestJS 12.1+: Helmet defaults, including removal of X-Powered-By.
  app.useSecurityHeaders();

  const configService = app.get(ConfigService);

  // Behind Caddy: take the client IP and protocol from X-Forwarded-* of the
  // configured number of hops only, so secure cookies are issued and rate
  // limits apply per client instead of per proxy.
  const trustProxy = Number(configService.get('TRUST_PROXY') ?? 0);
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }
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
