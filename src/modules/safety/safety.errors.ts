import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function userNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
  });
}

export function cannotTargetSelf(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'CANNOT_TARGET_SELF',
    message: 'You cannot block or report yourself',
  });
}

export function cannotTargetAdmin(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'CANNOT_TARGET_ADMIN',
    message: 'Staff accounts cannot be blocked or suspended here',
  });
}

export function reportBookingMismatch(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'REPORT_BOOKING_MISMATCH',
    message: 'The booking is not between you and the reported user',
  });
}

export function reportNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'REPORT_NOT_FOUND',
    message: 'Report not found',
  });
}

export function reportAlreadyClosed(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'REPORT_ALREADY_CLOSED',
    message: 'The report was already resolved or dismissed',
  });
}

export function userNotActive(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'USER_NOT_ACTIVE',
    message: 'Only active accounts can be suspended',
  });
}

export function userNotSuspended(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'USER_NOT_SUSPENDED',
    message: 'Only suspended accounts can be reactivated',
  });
}
