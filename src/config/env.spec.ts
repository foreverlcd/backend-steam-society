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

  it('defaults payments to disabled with a 15 % fee', () => {
    expect(validateEnv(validEnv)).toMatchObject({
      PAYMENTS_PROVIDER: 'disabled',
      PAYMENTS_FEE_BPS: 1500,
    });
  });

  it('rejects the fake payment provider in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENTS_PROVIDER: 'fake',
      }),
    ).toThrow(/fake payment provider/);
  });

  it('rejects an unknown payment provider', () => {
    expect(() =>
      validateEnv({ ...validEnv, PAYMENTS_PROVIDER: 'stripe' }),
    ).toThrow(/PAYMENTS_PROVIDER/);
  });
});
