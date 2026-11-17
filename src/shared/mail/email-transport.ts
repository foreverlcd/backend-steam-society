import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Stable per queued row: a resend after a crash keeps the same id. */
  messageId?: string;
}

/** Delivers one e-mail now. Only the outbox dispatcher calls it. */
export interface EmailTransport {
  /** False when no SMTP server is configured: mail waits in the outbox. */
  readonly configured: boolean;
  deliver(email: OutgoingEmail): Promise<void>;
}

@Injectable()
export class SmtpEmailTransport implements EmailTransport {
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const smtpUrl = configService.get<string>('SMTP_URL');
    this.transporter = smtpUrl
      ? createTransport({
          url: smtpUrl,
          // Fail fast: a stuck provider must not hold the dispatcher.
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 30_000,
        })
      : null;
    this.from = configService.getOrThrow<string>('SMTP_FROM');
  }

  get configured(): boolean {
    return this.transporter !== null;
  }

  async deliver(email: OutgoingEmail): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP_URL is not configured');
    }
    await this.transporter.sendMail({ from: this.from, ...email });
  }
}
