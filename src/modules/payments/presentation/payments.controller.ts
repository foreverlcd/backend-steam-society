import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../shared/http/public.decorator.js';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { PaymentsService } from '../application/payments.service.js';
import { paymentProviderNotFound } from '../application/payments.errors.js';
import {
  providerParamSchema,
  startCheckoutSchema,
  type StartCheckoutBody,
} from './payments.schemas.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  @Public()
  config() {
    const provider = this.payments.provider;

    return { enabled: provider !== 'disabled', provider };
  }

  @Post('checkout')
  @Roles('mentee')
  @HttpCode(200)
  checkout(
    @CurrentUser() user: AuthUser,
    @Body({ schema: startCheckoutSchema }) body: StartCheckoutBody,
  ) {
    return this.payments.startCheckout(user, body.bookingId);
  }

  @Post('webhooks/:provider')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  webhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    if (!providerParamSchema.safeParse(provider).success) {
      throw paymentProviderNotFound();
    }

    return this.payments.handleWebhook(provider, { headers, body });
  }
}
