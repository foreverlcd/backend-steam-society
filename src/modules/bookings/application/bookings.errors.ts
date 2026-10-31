import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function offeringNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'OFFERING_NOT_FOUND',
    message: 'Offering not found',
  });
}

export function offeringArchived(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'OFFERING_ARCHIVED',
    message: 'The offering is archived',
  });
}

export function mentorNotApproved(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'MENTOR_NOT_APPROVED',
    message: 'The mentor profile must be approved before receiving bookings',
  });
}

export function bookingNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'BOOKING_NOT_FOUND',
    message: 'Booking not found',
  });
}

export function bookingForbidden(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'BOOKING_FORBIDDEN',
    message: 'This booking does not belong to you',
  });
}

export function bookingRoleNotAllowed(action: string): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'BOOKING_ROLE_NOT_ALLOWED',
    message: `This account cannot ${action} a booking`,
  });
}

export function bookingSlotUnavailable(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'BOOKING_SLOT_UNAVAILABLE',
    message: 'The requested time is not an available slot',
  });
}

export function bookingSlotTaken(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'BOOKING_SLOT_TAKEN',
    message: 'Another booking took this slot',
  });
}

export function bookingMenteeOverlap(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'BOOKING_MENTEE_OVERLAP',
    message: 'You already have an active booking that overlaps this time',
  });
}

export function bookingStatusConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'BOOKING_STATUS_CONFLICT',
    message: 'The booking changed while processing the request',
  });
}

export function bookingExpired(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'BOOKING_EXPIRED',
    message: 'The booking request expired',
  });
}

export function invalidBookingTransition(message: string): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'INVALID_BOOKING_TRANSITION',
    message,
  });
}

export function menteeProfileRequired(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'MENTEE_PROFILE_REQUIRED',
    message: 'Complete your mentee profile before requesting a booking',
  });
}

export function meetingUrlRequired(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'MEETING_URL_REQUIRED',
    message: 'A meeting URL is required to confirm a free booking',
  });
}
