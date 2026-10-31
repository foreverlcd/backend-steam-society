import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { BookingsService } from '../application/bookings.service.js';
import {
  acceptBookingSchema,
  cancelBookingSchema,
  createBookingSchema,
  declineBookingSchema,
  listBookingsQuerySchema,
  type AcceptBookingBody,
  type CancelBookingBody,
  type CreateBookingBody,
  type DeclineBookingBody,
  type ListBookingsQuery,
} from './bookings.schemas.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Roles('mentee')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createBookingSchema }) body: CreateBookingBody,
  ) {
    return this.bookings.create(user, body);
  }

  @Get()
  @Roles('mentee', 'mentor')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listBookingsQuerySchema }) query: ListBookingsQuery,
  ) {
    return this.bookings.list(user, query);
  }

  @Get(':id')
  @Roles('mentee', 'mentor')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookings.get(user, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Roles('mentor')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: acceptBookingSchema }) body: AcceptBookingBody,
  ) {
    return this.bookings.accept(user, id, body);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @Roles('mentor')
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: declineBookingSchema }) body: DeclineBookingBody,
  ) {
    return this.bookings.decline(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('mentee', 'mentor')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: cancelBookingSchema }) body: CancelBookingBody,
  ) {
    return this.bookings.cancel(user, id, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles('mentor')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookings.complete(user, id);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  @Roles('mentee', 'mentor')
  noShow(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookings.noShow(user, id);
  }
}
