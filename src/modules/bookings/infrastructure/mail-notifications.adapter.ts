import { Injectable } from '@nestjs/common';
import { MailerService } from '../../auth/mailer.service.js';
import type {
  BookingNotification,
  NotificationsPort,
} from '../application/ports/notifications.port.js';

@Injectable()
export class MailNotificationsAdapter implements NotificationsPort {
  constructor(private readonly mailer: MailerService) {}

  async send(notification: BookingNotification): Promise<void> {
    const when = formatInstant(notification.startsAt, notification.timezone);

    switch (notification.type) {
      case 'requested':
        await this.mailer.send({
          kind: 'booking.requested',
          to: notification.recipientEmail,
          subject: 'Nueva solicitud de mentoría en Steam Society',
          text: [
            `Hola ${notification.recipientName}:`,
            `${notification.counterpartName} solicitó una mentoría "${notification.offeringTitle}" para el ${when}.`,
            `Responde antes del ${formatInstant(notification.expiresAt, notification.timezone)}.`,
            'Entra a Steam Society para aceptar o rechazar la solicitud.',
          ].join('\n\n'),
        });
        return;

      case 'accepted':
        await this.mailer.send({
          kind: 'booking.accepted',
          to: notification.recipientEmail,
          subject: 'Tu mentoría fue aceptada en Steam Society',
          text: [
            `Hola ${notification.recipientName}:`,
            `${notification.counterpartName} aceptó tu solicitud de mentoría "${notification.offeringTitle}" para el ${when}.`,
            notification.meetingUrl
              ? `Enlace de la sesión: ${notification.meetingUrl}`
              : 'La mentora compartirá el enlace de la sesión.',
          ].join('\n\n'),
        });
        return;

      case 'declined':
        await this.mailer.send({
          kind: 'booking.declined',
          to: notification.recipientEmail,
          subject: 'Tu solicitud de mentoría fue rechazada',
          text: [
            `Hola ${notification.recipientName}:`,
            `${notification.counterpartName} no pudo aceptar tu solicitud de mentoría "${notification.offeringTitle}" para el ${when}.`,
            notification.reason
              ? `Motivo: ${notification.reason}`
              : 'Puedes buscar otro horario disponible.',
          ].join('\n\n'),
        });
        return;

      case 'cancelled':
        await this.mailer.send({
          kind: 'booking.cancelled',
          to: notification.recipientEmail,
          subject: 'Una reserva fue cancelada en Steam Society',
          text: [
            `Hola ${notification.recipientName}:`,
            `${notification.counterpartName} canceló la mentoría "${notification.offeringTitle}" del ${when}.`,
            notification.reason
              ? `Motivo: ${notification.reason}`
              : 'Entra a Steam Society para ver tus próximas sesiones.',
          ].join('\n\n'),
        });
        return;

      case 'expired':
        await this.mailer.send({
          kind: 'booking.expired',
          to: notification.recipientEmail,
          subject: 'Tu solicitud de mentoría venció',
          text: [
            `Hola ${notification.recipientName}:`,
            `La solicitud de mentoría "${notification.offeringTitle}" para el ${when} venció sin respuesta.`,
            'Puedes solicitar otro horario disponible.',
          ].join('\n\n'),
        });
        return;

      case 'reminder':
        await this.mailer.send({
          kind: 'booking.reminder',
          to: notification.recipientEmail,
          subject: 'Mañana tienes una mentoría en Steam Society',
          text: [
            `Hola ${notification.recipientName}:`,
            `Te recordamos tu mentoría "${notification.offeringTitle}" con ${notification.counterpartName} el ${when}.`,
            notification.meetingUrl
              ? `Enlace de la sesión: ${notification.meetingUrl}`
              : 'El enlace de la sesión estará en tu reserva en Steam Society.',
            'Si no puedes asistir, cancela desde Steam Society para avisar a la otra persona.',
          ].join('\n\n'),
          // Pointless once the session has started.
          expiresAt: notification.startsAt,
        });
        return;
    }
  }
}

function formatInstant(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(instant);
  }
}
