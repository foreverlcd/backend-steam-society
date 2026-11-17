import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import type { AuthUser } from './auth.types.js';
import { MfaRepository } from './mfa.repository.js';
import { PasswordHasher } from './password-hasher.service.js';
import { SecretBox } from './secret-box.js';
import {
  base32Encode,
  generateTotpSecret,
  matchTotpStep,
  totpProvisioningUri,
} from './totp.js';
import { UserRepository } from './user.repository.js';

export const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Steam Society';
/** Roles that cannot turn the second factor off (ADR-024). */
const MFA_REQUIRED_ROLES: ReadonlySet<AuthUser['role']> = new Set(['admin']);

export interface MfaStatus {
  enabled: boolean;
  required: boolean;
  recoveryCodesRemaining: number;
}

export interface TotpSetup {
  /** Base32 key for manual entry in the authenticator app. */
  secret: string;
  /** otpauth:// URI; render it as a QR code or open it on the phone. */
  otpauthUri: string;
}

/** A second-factor proof: a 6-digit app code or a one-time recovery code. */
export type SecondFactorProof = { code: string } | { recoveryCode: string };

@Injectable()
export class MfaService {
  constructor(
    private readonly mfa: MfaRepository,
    private readonly users: UserRepository,
    private readonly secretBox: SecretBox,
    private readonly passwordHasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  isRequiredFor(role: AuthUser['role']): boolean {
    return MFA_REQUIRED_ROLES.has(role);
  }

  async getStatus(user: AuthUser): Promise<MfaStatus> {
    return {
      enabled: user.mfaEnabled,
      required: this.isRequiredFor(user.role),
      recoveryCodesRemaining: user.mfaEnabled
        ? await this.mfa.countUnusedRecoveryCodes(user.id)
        : 0,
    };
  }

  async startTotpSetup(user: AuthUser): Promise<TotpSetup> {
    if (user.mfaEnabled) throw mfaAlreadyEnabled();
    const secret = generateTotpSecret();
    await this.mfa.saveUnconfirmedTotp(user.id, this.secretBox.encrypt(secret));
    return {
      secret,
      otpauthUri: totpProvisioningUri(secret, user.email, TOTP_ISSUER),
    };
  }

  /** Confirms setup with a first code and returns the recovery codes once. */
  async confirmTotpSetup(user: AuthUser, code: string): Promise<string[]> {
    if (user.mfaEnabled) throw mfaAlreadyEnabled();
    const totp = await this.mfa.findTotp(user.id);
    if (!totp) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MFA_SETUP_REQUIRED',
        message: 'Start the authenticator setup first',
      });
    }
    if (!(await this.acceptTotpCode(user.id, totp.secretCiphertext, code))) {
      throw invalidMfaCode();
    }
    const codes = generateRecoveryCodes();
    await this.mfa.enableTotp(
      user.id,
      this.clock.now(),
      codes.map(hashRecoveryCode),
    );
    return codes;
  }

  async disable(user: AuthUser, password: string, code: string): Promise<void> {
    if (this.isRequiredFor(user.role)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MFA_REQUIRED_FOR_ROLE',
        message: 'This role must keep two-factor authentication on',
      });
    }
    if (!user.mfaEnabled) return;

    const account = await this.users.findById(user.id);
    const passwordOk =
      !!account?.passwordHash &&
      (await this.passwordHasher.verify(account.passwordHash, password));
    if (!passwordOk || !(await this.verifySecondFactor(user.id, { code }))) {
      throw invalidMfaCode();
    }
    await this.mfa.disableTotp(user.id);
  }

  async regenerateRecoveryCodes(
    user: AuthUser,
    code: string,
  ): Promise<string[]> {
    if (!user.mfaEnabled) throw mfaNotEnabled();
    if (!(await this.verifySecondFactor(user.id, { code }))) {
      throw invalidMfaCode();
    }
    const codes = generateRecoveryCodes();
    await this.mfa.replaceRecoveryCodes(user.id, codes.map(hashRecoveryCode));
    return codes;
  }

  /** Checks a login or step-up proof against a confirmed factor. */
  async verifySecondFactor(
    userId: string,
    proof: SecondFactorProof,
  ): Promise<boolean> {
    const totp = await this.mfa.findTotp(userId);
    if (!totp?.confirmedAt) return false;

    if ('recoveryCode' in proof) {
      return this.mfa.consumeRecoveryCode(
        userId,
        hashRecoveryCode(proof.recoveryCode),
        this.clock.now(),
      );
    }
    return this.acceptTotpCode(userId, totp.secretCiphertext, proof.code);
  }

  private async acceptTotpCode(
    userId: string,
    secretCiphertext: string,
    code: string,
  ): Promise<boolean> {
    const step = matchTotpStep(
      this.secretBox.decrypt(secretCiphertext),
      code,
      this.clock.now(),
    );
    // acceptTimeStep rejects a step that was already used (replay).
    return step !== null && this.mfa.acceptTimeStep(userId, step);
  }
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

export function invalidMfaCode(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'INVALID_MFA_CODE',
    message: 'Invalid verification code',
  });
}

function mfaAlreadyEnabled(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'MFA_ALREADY_ENABLED',
    message: 'Two-factor authentication is already enabled',
  });
}

function mfaNotEnabled(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'MFA_NOT_ENABLED',
    message: 'Two-factor authentication is not enabled',
  });
}
