import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('rejects a short session secret', () => {
    expect(() => validateEnv({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('applies safe defaults', () => {
    const parsed = validateEnv(validEnv);

    expect(parsed).toMatchObject({
      PORT: 3000,
      SESSION_COOKIE_SECURE: 'true',
      APP_URL: 'http://localhost:3001',
    });
  });
});
