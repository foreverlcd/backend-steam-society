import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { getTestDatabaseUrl } from './test-database.js';

export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    stdio: 'inherit',
  });
}
