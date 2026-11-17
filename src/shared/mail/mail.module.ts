import { Global, Module } from '@nestjs/common';
import { CLOCK } from '../clock/clock.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SystemClock } from '../clock/system-clock.js';
import { EmailDispatcher } from './email-dispatcher.js';
import { EmailOutbox } from './email-outbox.service.js';
import { EMAIL_TRANSPORT, SmtpEmailTransport } from './email-transport.js';

/** Outgoing e-mail: queue (EmailOutbox) + background sender with retries. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    EmailOutbox,
    EmailDispatcher,
    { provide: EMAIL_TRANSPORT, useClass: SmtpEmailTransport },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [EmailOutbox],
})
export class MailModule {}
