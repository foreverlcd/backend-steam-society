import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.service.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with Argon2id and verifies the original password', async () => {
    const hash = await hasher.hash('correct-horse-battery');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, 'correct-horse-battery')).resolves.toBe(
      true,
    );
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('correct-horse-battery');

    await expect(hasher.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('runs a dummy verification for unknown users', async () => {
    await expect(hasher.verifyDummy('anything')).resolves.toBe(false);
  });
});
