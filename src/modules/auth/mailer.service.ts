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
    if (!this.transporter) {
      throw new Error('SMTP_URL is not configured');
    }

    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Restablece tu contraseña de Steam Society',
      text: [
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Abre este enlace (válido 1 hora y un solo uso): ${resetUrl}`,
        'Si no fuiste tú, ignora este correo.',
      ].join('\n\n'),
    });
  }
}
