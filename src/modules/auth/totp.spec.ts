import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  matchTotpStep,
  totpCodeForStep,
  totpProvisioningUri,
  totpTimeStep,
} from './totp.js';

// RFC 6238 Appendix B, SHA-1 seed "12345678901234567890" (8-digit codes there;
// the 6-digit code is the last 6 digits of the same value).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('totp', () => {
  it.each(RFC_VECTORS)('matches RFC 6238 vector at t=%i', (seconds, code) => {
    expect(totpCodeForStep(RFC_SECRET, totpTimeStep(new Date(seconds * 1000)))).toBe(code);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('any bytes ÿ', 'utf8');
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('generates 160-bit secrets', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it('accepts the current code and one step of drift, nothing further', () => {
    const now = new Date(1_700_000_000_000);
    const step = totpTimeStep(now);
    expect(matchTotpStep(RFC_SECRET, totpCodeForStep(RFC_SECRET, step), now)).toBe(step);
    expect(matchTotpStep(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotpStep(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotpStep(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 2), now)).toBeNull();
  });

  it('rejects malformed codes', () => {
    const now = new Date();
    expect(matchTotpStep(RFC_SECRET, '12345', now)).toBeNull();
    expect(matchTotpStep(RFC_SECRET, 'abcdef', now)).toBeNull();
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = totpProvisioningUri('JBSWY3DPEHPK3PXP', 'ana@example.com', 'Steam Society');
    expect(uri).toBe(
      'otpauth://totp/Steam%20Society%3Aana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Steam+Society&algorithm=SHA1&digits=6&period=30',
    );
  });
});
