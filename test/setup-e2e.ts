import 'dotenv/config';
import { getTestDatabaseUrl } from './test-database.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.SESSION_SECRET ??= 'test-session-secret-with-at-least-32-chars';
process.env.SESSION_COOKIE_SECURE ??= 'false';
process.env.WEB_ORIGIN ??= 'http://localhost:3001';
process.env.APP_URL ??= 'http://localhost:3001';
process.env.SMTP_FROM ??= 'Steam Society <no-reply@steamsociety.local>';
// The payment e2e tests drive the fake provider; force it so a CI or shell
// value (e.g. PAYMENTS_PROVIDER=disabled) cannot silently switch it off.
process.env.PAYMENTS_PROVIDER = 'fake';
// The outbox sender is driven by the tests themselves (test/email-outbox).
process.env.EMAIL_DISPATCH_INTERVAL_MS = '0';
// Suites register many accounts from one IP. Hitting the per-IP sign-up cap
// would block that IP for the whole window, so it is not exercised here.
process.env.REGISTER_RATE_LIMIT = '1000';
