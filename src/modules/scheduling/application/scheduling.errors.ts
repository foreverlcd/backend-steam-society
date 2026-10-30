import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function mentorOnly(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'MENTOR_ONLY',
    message: 'This action is only available to mentors',
  });
}

export function mentorProfileNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'MENTOR_PROFILE_NOT_FOUND',
    message: 'Mentor profile not found',
  });
}

export function mentorNotApproved(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'MENTOR_NOT_APPROVED',
    message: 'The mentor profile must be approved before making changes',
  });
}

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

export function invalidOfferingPrice(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_OFFERING_PRICE',
    message:
      'Free offerings must cost 0 and paid offerings must cost more than 0',
  });
}

export function invalidCurrency(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_CURRENCY',
    message: 'Currency must be an ISO 4217 code',
  });
}

export function invalidTimeZone(timezone: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_TIMEZONE',
    message: `Invalid IANA time zone: ${timezone}`,
  });
}

export function invalidAvailabilityRange(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_AVAILABILITY_RANGE',
    message,
  });
}

export function invalidSlotRange(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_SLOT_RANGE',
    message,
  });
}

export function slotRangeTooLarge(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'SLOT_RANGE_TOO_LARGE',
    message: 'The requested slot range is too large',
  });
}

export function invalidAvailabilityRule(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_AVAILABILITY_RULE',
    message,
  });
}
