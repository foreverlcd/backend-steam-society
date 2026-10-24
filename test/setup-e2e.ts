import 'dotenv/config';
import { getTestDatabaseUrl } from './test-database.js';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.SESSION_SECRET ??= 'test-session-secret-with-at-least-32-chars';
process.env.SESSION_COOKIE_SECURE ??= 'false';
process.env.WEB_ORIGIN ??= 'http://localhost:3001';
process.env.APP_URL ??= 'http://localhost:3001';
process.env.SMTP_FROM ??= 'Steam Society <no-reply@steamsociety.local>';
