export const NOTIFICATIONS_PORT = Symbol('NOTIFICATIONS_PORT');

export type BookingNotificationType =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface BookingNotification {
  type: BookingNotificationType;
  bookingId: string;
  recipientEmail: string;
  recipientName: string;
  counterpartName: string;
  offeringTitle: string;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  timezone: string;
  meetingUrl: string | null;
  reason: string | null;
}

export interface NotificationsPort {
  send(notification: BookingNotification): Promise<void>;
}
