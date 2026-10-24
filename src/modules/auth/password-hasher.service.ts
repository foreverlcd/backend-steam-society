import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// OWASP minimum for Argon2id: 19 MiB, 2 iterations, 1 lane.
const HASH_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Valid Argon2id hash of an unrelated password, used to keep unknown-email
// logins as slow as wrong-password logins.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$vNAXoQkOWq7QmYYA2OlrtQ$SisIYOAHNJSJBB5KxTVagCDuF+7N/ZkW61LwqEiwFgo';

@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, HASH_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  async verifyDummy(password: string): Promise<false> {
    await verify(DUMMY_HASH, password);
    return false;
  }
}
