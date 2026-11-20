import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  EmailOutbox,
  type EmailToQueue,
} from '../../shared/mail/email-outbox.service.js';

const HOUR_MS = 3_600_000;

/**
 * Writes the e-mails of the platform and queues them in the outbox; the
 * dispatcher sends them with retries (src/shared/mail).
 */
@Injectable()
export class MailerService {
  private readonly appUrl: string;

  constructor(
    configService: ConfigService,
    private readonly outbox: EmailOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.appUrl = configService
      .getOrThrow<string>('APP_URL')
      .replace(/\/+$/, '');
  }

  private validFor(hours: number): Date {
    return new Date(this.clock.now().getTime() + hours * HOUR_MS);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.send({
      kind: 'auth.password_reset',
      to: to,
      subject: 'Restablece tu contraseña de Steam Society',
      text: [
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Abre este enlace (válido 1 hora y un solo uso): ${resetUrl}`,
        'Si no fuiste tú, ignora este correo.',
      ].join('\n\n'),
      expiresAt: this.validFor(1),
    });
  }

  async sendEmailVerification(
    to: string,
    token: string,
    validHours: number,
  ): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send({
      kind: 'auth.email_verification',
      to: to,
      subject: 'Confirma tu correo en Steam Society',
      text: [
        'Gracias por registrarte en Steam Society.',
        `Confirma tu correo abriendo este enlace (válido ${validHours} horas): ${verifyUrl}`,
        'Necesitas confirmarlo para reservar sesiones o enviar tu perfil de mentora a revisión.',
        'Si no creaste esta cuenta, ignora este correo.',
      ].join('\n\n'),
      expiresAt: this.validFor(validHours),
    });
  }

  /** Sent to the parent/guardian of an under-14 user (Ley 29733). */
  async sendGuardianConsentRequest(
    to: string,
    childFirstName: string | null,
    token: string,
    validDays: number,
  ): Promise<void> {
    const consentUrl = `${this.appUrl}/guardian-consent?token=${encodeURIComponent(token)}`;
    const who = childFirstName ?? 'Una persona menor de 14 años';

    await this.send({
      kind: 'auth.guardian_consent_request',
      to,
      subject: 'Autoriza la cuenta de tu hija o hijo en Steam Society',
      text: [
        `${who} creó una cuenta en Steam Society, una plataforma de mentorías 1 a 1 en ciencia, tecnología, ingeniería, arte y matemáticas, y te indicó como su madre, padre o tutor.`,
        'Por ser menor de 14 años, la ley peruana pide tu autorización para tratar sus datos personales. Hasta que autorices, no podrá reservar sesiones.',
        `Lee qué datos usamos y autoriza aquí (válido ${validDays} días): ${consentUrl}`,
        `Política de privacidad: ${this.appUrl}/privacidad`,
        'Si no conoces esta cuenta o no quieres autorizarla, ignora este correo.',
      ].join('\n\n'),
      expiresAt: this.validFor(validDays * 24),
    });
  }

  /** Sent to the NEW address: proves it belongs to the user. */
  async sendEmailChangeVerification(
    to: string,
    token: string,
    validHours: number,
  ): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send({
      kind: 'auth.email_change_verification',
      to: to,
      subject: 'Confirma tu nuevo correo en Steam Society',
      text: [
        'Pediste usar este correo en tu cuenta de Steam Society.',
        `Confírmalo abriendo este enlace (válido ${validHours} horas): ${verifyUrl}`,
        'Hasta que lo confirmes, seguirás entrando con tu correo anterior.',
        'Si no fuiste tú, ignora este correo.',
      ].join('\n\n'),
      expiresAt: this.validFor(validHours),
    });
  }

  /** Security notices go to the address that owned the account. */
  async sendEmailChangeRequestedNotice(to: string): Promise<void> {
    await this.send({
      kind: 'auth.email_change_requested',
      to: to,
      subject: 'Pidieron cambiar el correo de tu cuenta',
      text: [
        'Alguien con tu contraseña pidió cambiar el correo de tu cuenta de Steam Society.',
        'El cambio solo se hace si se confirma desde el correo nuevo.',
        'Si no fuiste tú, cambia tu contraseña y cierra las demás sesiones desde Seguridad.',
      ].join('\n\n'),
    });
  }

  async sendEmailChangedNotice(to: string, newEmail: string): Promise<void> {
    await this.send({
      kind: 'auth.email_changed',
      to: to,
      subject: 'Cambió el correo de tu cuenta',
      text: [
        `Tu cuenta de Steam Society ahora usa el correo ${maskEmail(newEmail)}.`,
        'Si no fuiste tú, escríbenos respondiendo a este correo.',
      ].join('\n\n'),
    });
  }

  async sendPasswordChangedNotice(to: string): Promise<void> {
    await this.send({
      kind: 'auth.password_changed',
      to: to,
      subject: 'Cambió la contraseña de tu cuenta',
      text: [
        'La contraseña de tu cuenta de Steam Society se cambió y cerramos las demás sesiones.',
        'Si no fuiste tú, restablécela ahora desde "¿Olvidaste tu contraseña?".',
      ].join('\n\n'),
    });
  }

  async sendMfaEnabledNotice(to: string): Promise<void> {
    await this.send({
      kind: 'auth.mfa_enabled',
      to: to,
      subject: 'Activaste la verificación en dos pasos',
      text: [
        'Tu cuenta de Steam Society ahora pide un código de tu app de autenticación al iniciar sesión, y cerramos las demás sesiones.',
        'Si no fuiste tú, escríbenos respondiendo a este correo para recuperar tu cuenta.',
      ].join('\n\n'),
    });
  }

  /** Queues any e-mail; other modules use it for their own templates. */
  async send(email: EmailToQueue): Promise<void> {
    await this.outbox.enqueue(email);
  }

  async withdraw(dedupeKeys: string[]): Promise<void> {
    await this.outbox.withdraw(dedupeKeys);
  }
}

/** a***@dominio.com: enough to recognise the address without exposing it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
