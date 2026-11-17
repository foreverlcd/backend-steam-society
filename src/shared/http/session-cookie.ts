/** Sessions slide: each request pushes the expiry this far ahead. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SECURE_SESSION_COOKIE_NAME = '__Host-sid';
export const INSECURE_SESSION_COOKIE_NAME = 'sid';

export function resolveSessionCookieName(secure: boolean): string {
  return secure ? SECURE_SESSION_COOKIE_NAME : INSECURE_SESSION_COOKIE_NAME;
}
