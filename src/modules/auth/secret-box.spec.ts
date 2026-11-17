import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';

function box(values: Record<string, string | undefined>): SecretBox {
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new SecretBox(config);
}

describe('SecretBox', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips and never stores the plaintext', () => {
    const secretBox = box({ MFA_ENCRYPTION_KEY: key });
    const stored = secretBox.encrypt('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(secretBox.decrypt(stored)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV each time', () => {
    const secretBox = box({ MFA_ENCRYPTION_KEY: key });
    expect(secretBox.encrypt('same')).not.toBe(secretBox.encrypt('same'));
  });

  it('rejects tampered ciphertext and other keys', () => {
    const stored = box({ MFA_ENCRYPTION_KEY: key }).encrypt('secret');
    const other = box({ MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
    expect(() => other.decrypt(stored)).toThrow();
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box({ MFA_ENCRYPTION_KEY: key }).decrypt(parts.join('.'))).toThrow();
  });

  it('derives a stable key from SESSION_SECRET when no key is configured', () => {
    const values = { SESSION_SECRET: 'x'.repeat(40) };
    const stored = box(values).encrypt('dev');
    expect(box(values).decrypt(stored)).toBe('dev');
  });
});
