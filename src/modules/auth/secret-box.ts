import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';

/**
 * Encrypts small secrets at rest (TOTP seeds) with AES-256-GCM.
 * Stored format: `v1.<iv>.<authTag>.<ciphertext>` (base64url parts).
 */
@Injectable()
export class SecretBox {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const configured = configService.get<string>('MFA_ENCRYPTION_KEY');
    if (configured) {
      this.key = Buffer.from(configured, 'base64');
    } else {
      // Development only (env validation requires the key in production).
      new Logger(SecretBox.name).warn(
        'MFA_ENCRYPTION_KEY is not set; deriving it from SESSION_SECRET (development only)',
      );
      this.key = Buffer.from(
        hkdfSync(
          'sha256',
          configService.getOrThrow<string>('SESSION_SECRET'),
          'steam-society',
          'mfa-encryption-key',
          32,
        ),
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decrypt(stored: string): string {
    const [version, iv, tag, ciphertext] = stored.split('.');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
      throw new Error('Unsupported secret format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
