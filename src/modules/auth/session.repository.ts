import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { SESSION_TTL_MS } from '../../shared/http/session-cookie.js';

/** One signed-in device, as shown to its owner. */
export interface ActiveSession {
  /** Opaque id derived from the session id; the real id never leaves the server. */
  id: string;
  current: boolean;
  signedInAt: Date | null;
  lastActiveAt: Date;
  userAgent: string | null;
}

interface SessionRow {
  sid: string;
  sess: { signedInAtMs?: unknown; userAgent?: unknown };
  expire: Date;
}

/** Public id of a session: a hash, so listing sessions never leaks cookies. */
export function publicSessionId(sid: string): string {
  return createHash('sha256').update(sid).digest('hex').slice(0, 32);
}

/**
 * Reads and revokes rows of the express-session store (`auth_session`, owned
 * by connect-pg-simple) for one user. Revoking = deleting the row: the cookie
 * stops working on its next request.
 */
@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    userId: string,
    currentSid: string,
    now: Date,
  ): Promise<ActiveSession[]> {
    const rows = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT sid, sess, expire FROM auth_session
      WHERE sess->>'userId' = ${userId} AND expire > ${now}
      ORDER BY expire DESC`;
    return rows.map((row) => ({
      id: publicSessionId(row.sid),
      current: row.sid === currentSid,
      signedInAt:
        typeof row.sess.signedInAtMs === 'number'
          ? new Date(row.sess.signedInAtMs)
          : null,
      // Rolling sessions: expiry = last request + TTL.
      lastActiveAt: new Date(row.expire.getTime() - SESSION_TTL_MS),
      userAgent:
        typeof row.sess.userAgent === 'string' ? row.sess.userAgent : null,
    }));
  }

  /** Revokes one session of the user by its public id; false if not found. */
  async revoke(userId: string, publicId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ sid: string }>>`
      SELECT sid FROM auth_session WHERE sess->>'userId' = ${userId}`;
    const match = rows.find((row) => publicSessionId(row.sid) === publicId);
    if (!match) return false;
    await this.prisma
      .$executeRaw`DELETE FROM auth_session WHERE sid = ${match.sid}`;
    return true;
  }

  /** Revokes every session of the user except `keepSid` (if given). */
  async revokeAll(userId: string, keepSid?: string): Promise<number> {
    return keepSid
      ? this.prisma.$executeRaw`
          DELETE FROM auth_session WHERE sess->>'userId' = ${userId} AND sid <> ${keepSid}`
      : this.prisma
          .$executeRaw`DELETE FROM auth_session WHERE sess->>'userId' = ${userId}`;
  }
}
