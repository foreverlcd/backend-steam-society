import { Temporal } from 'temporal-polyfill';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: 2000,
        month: 1,
        day: 1,
        hour: 12,
      },
      { disambiguation: 'reject' },
    );

    return true;
  } catch {
    return false;
  }
}
