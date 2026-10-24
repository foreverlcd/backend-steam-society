export const SECURE_SESSION_COOKIE_NAME = '__Host-sid';
export const INSECURE_SESSION_COOKIE_NAME = 'sid';

export function resolveSessionCookieName(secure: boolean): string {
  return secure ? SECURE_SESSION_COOKIE_NAME : INSECURE_SESSION_COOKIE_NAME;
}
