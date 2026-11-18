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
import { Roles } from '../../shared/http/roles.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AdminService } from './admin.service.js';
import {
  adminCancelBookingSchema,
  listAdminBookingsQuerySchema,
  listAdminUsersQuerySchema,
  type AdminCancelBookingBody,
  type ListAdminBookingsQuery,
  type ListAdminUsersQuery,
} from './admin.schemas.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @Roles('admin')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  @Roles('admin')
  users(
    @Query({ schema: listAdminUsersQuerySchema }) query: ListAdminUsersQuery,
  ) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @Roles('admin')
  user(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.getUser(id);
  }

  @Get('bookings')
  @Roles('admin')
  bookings(
    @Query({ schema: listAdminBookingsQuerySchema })
    query: ListAdminBookingsQuery,
  ) {
    return this.admin.listBookings(query);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @Roles('admin')
  cancel(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: adminCancelBookingSchema }) body: AdminCancelBookingBody,
  ) {
    return this.admin.cancelBooking(admin, id, body.reason);
  }
}
