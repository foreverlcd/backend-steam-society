import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK } from '../../shared/clock/clock.js';
import { SystemClock } from '../../shared/clock/system-clock.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { PaymentsService } from './application/payments.service.js';
import { BOOKING_PAYMENT_PORT } from './application/ports/booking-payment.port.js';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from './application/ports/payment-gateway.port.js';
import { PAYMENT_REPOSITORY } from './application/ports/payment.repository.js';
import { BookingsBookingPaymentAdapter } from './infrastructure/bookings-booking-payment.adapter.js';
import { DisabledPaymentGateway } from './infrastructure/disabled-payment.gateway.js';
import { FakePaymentGateway } from './infrastructure/fake-payment.gateway.js';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository.js';
import { PaymentsController } from './presentation/payments.controller.js';

/**
 * Self-contained payments module. To remove it, drop it from AppModule; to
 * add a real provider, write a PaymentGateway adapter and map it below.
 */
@Module({
  imports: [PrismaModule, AuthModule, BookingsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentGateway => {
        switch (config.getOrThrow<string>('PAYMENTS_PROVIDER')) {
          case 'fake':
            return new FakePaymentGateway(config.getOrThrow<string>('APP_URL'));
          default:
            return new DisabledPaymentGateway();
        }
      },
    },
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: BOOKING_PAYMENT_PORT, useClass: BookingsBookingPaymentAdapter },
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class PaymentsModule {}
