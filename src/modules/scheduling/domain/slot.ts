export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  localStart: string;
  localEnd: string;
}
