import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { Roles } from '../../../shared/http/roles.decorator.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { CallsService } from '../application/calls.service.js';
import { callSignalSchema, type CallSignalBody } from './bookings.schemas.js';

/** In-app 1:1 video call of a confirmed booking (WebRTC, peer to peer). */
@Controller('bookings/:id/call')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  // Each call to this endpoint may mint TURN credentials.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  @Roles('mentee', 'mentor')
  info(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.calls.info(user, id);
  }

  @Sse('events')
  @Roles('mentee', 'mentor')
  // Reverse proxies must not buffer the stream.
  @Header('X-Accel-Buffering', 'no')
  async events(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.calls.join(user, id, () =>
      sessionStillOwnedBy(request, user.id),
    );
    return stream.pipe(map((event) => ({ data: event })));
  }

  // Negotiation sends a burst of ICE candidates; this still stops floods.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('signal')
  @HttpCode(200)
  @Roles('mentee', 'mentor')
  signal(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: callSignalSchema }) body: CallSignalBody,
  ) {
    return this.calls.signal(user, id, body);
  }
}

/**
 * Whether the login session of this request still exists and belongs to the
 * user (revoked sessions are deleted from the store). A store error counts as
 * alive: a database hiccup must not drop a call in progress.
 */
function sessionStillOwnedBy(
  request: Request,
  userId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    request.sessionStore.get(request.sessionID, (error, session) => {
      if (error) {
        resolve(true);
        return;
      }
      resolve(
        (session as { userId?: unknown } | null | undefined)?.userId === userId,
      );
    });
  });
}
