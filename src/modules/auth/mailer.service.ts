import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly transporter: Transporter | null;
  private readonly appUrl: string;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const smtpUrl = configService.get<string>('SMTP_URL');
    this.transporter = smtpUrl ? createTransport(smtpUrl) : null;
    this.appUrl = configService
      .getOrThrow<string>('APP_URL')
      .replace(/\/+$/, '');
    this.from = configService.getOrThrow<string>('SMTP_FROM');
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.send(
      to,
      'Restablece tu contraseña de Steam Society',
      [
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Abre este enlace (válido 1 hora y un solo uso): ${resetUrl}`,
        'Si no fuiste tú, ignora este correo.',
      ].join('\n\n'),
    );
  }

  async sendEmailVerification(
    to: string,
    token: string,
    validHours: number,
  ): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send(
      to,
      'Confirma tu correo en Steam Society',
      [
        'Gracias por registrarte en Steam Society.',
        `Confirma tu correo abriendo este enlace (válido ${validHours} horas): ${verifyUrl}`,
        'Necesitas confirmarlo para reservar sesiones o enviar tu perfil de mentora a revisión.',
        'Si no creaste esta cuenta, ignora este correo.',
      ].join('\n\n'),
    );
  }

  /** Sent to the NEW address: proves it belongs to the user. */
  async sendEmailChangeVerification(
    to: string,
    token: string,
    validHours: number,
  ): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send(
      to,
      'Confirma tu nuevo correo en Steam Society',
      [
        'Pediste usar este correo en tu cuenta de Steam Society.',
        `Confírmalo abriendo este enlace (válido ${validHours} horas): ${verifyUrl}`,
        'Hasta que lo confirmes, seguirás entrando con tu correo anterior.',
        'Si no fuiste tú, ignora este correo.',
      ].join('\n\n'),
    );
  }

  /** Security notices go to the address that owned the account. */
  async sendEmailChangeRequestedNotice(to: string): Promise<void> {
    await this.send(
      to,
      'Pidieron cambiar el correo de tu cuenta',
      [
        'Alguien con tu contraseña pidió cambiar el correo de tu cuenta de Steam Society.',
        'El cambio solo se hace si se confirma desde el correo nuevo.',
        'Si no fuiste tú, cambia tu contraseña y cierra las demás sesiones desde Seguridad.',
      ].join('\n\n'),
    );
  }

  async sendEmailChangedNotice(to: string, newEmail: string): Promise<void> {
    await this.send(
      to,
      'Cambió el correo de tu cuenta',
      [
        `Tu cuenta de Steam Society ahora usa el correo ${maskEmail(newEmail)}.`,
        'Si no fuiste tú, escríbenos respondiendo a este correo.',
      ].join('\n\n'),
    );
  }

  async sendPasswordChangedNotice(to: string): Promise<void> {
    await this.send(
      to,
      'Cambió la contraseña de tu cuenta',
      [
        'La contraseña de tu cuenta de Steam Society se cambió y cerramos las demás sesiones.',
        'Si no fuiste tú, restablécela ahora desde "¿Olvidaste tu contraseña?".',
      ].join('\n\n'),
    );
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP_URL is not configured');
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
    });
  }
}

/** a***@dominio.com: enough to recognise the address without exposing it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
