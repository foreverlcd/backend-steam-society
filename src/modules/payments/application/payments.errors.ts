import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

export function paymentsDisabled(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    code: 'PAYMENTS_DISABLED',
    message: 'Payments are not available yet',
  });
}

export function paymentAlreadyPaid(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'PAYMENT_ALREADY_PAID',
    message: 'This booking is already paid',
  });
}

export function paymentStatusConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'PAYMENT_STATUS_CONFLICT',
    message: 'The payment changed while processing the request',
  });
}

export function paymentProviderNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'PAYMENT_PROVIDER_NOT_FOUND',
    message: 'Unknown payment provider',
  });
}

export function invalidWebhook(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_WEBHOOK',
    message: 'The webhook could not be verified',
  });
}
