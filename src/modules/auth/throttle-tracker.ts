/**
 * Key the rate limiter counts against.
 *
 * Credential endpoints (login, password reset, e-mail verification) are keyed
 * by client IP + target e-mail and ignore any session the request carries:
 * otherwise an attacker could sign in to many throwaway accounts and rotate
 * their cookies to get a fresh quota per cookie against one victim.
 * Registration is keyed by IP alone, since rotating e-mails is the point of
 * an enumeration attempt. Second-factor guesses are keyed by the account
 * being signed in to. Everything else is per signed-in account, so people
 * behind one IP (a school, a NAT) don't exhaust each other's quota.
 */
const CREDENTIAL_PATHS = [
  '/auth/login',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/auth/email/verify',
];

export function throttleTracker(request: Record<string, unknown>): string {
  const rawUrl =
    typeof request.originalUrl === 'string'
      ? request.originalUrl
      : typeof request.url === 'string'
        ? request.url
        : '';
  const path = (rawUrl.split('?')[0] ?? '').replace(/\/+$/, '');
  const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
  const session = request.session as
    { userId?: unknown; pendingMfa?: { userId?: unknown } } | undefined;

  if (path.endsWith('/auth/register')) {
    return `register:${ip}`;
  }

  if (path.endsWith('/auth/login/mfa')) {
    const pending = session?.pendingMfa?.userId;
    return typeof pending === 'string'
      ? `mfa:${pending}`
      : ipEmail(request, ip);
  }

  if (CREDENTIAL_PATHS.some((suffix) => path.endsWith(suffix))) {
    return ipEmail(request, ip);
  }

  if (typeof session?.userId === 'string') {
    return `user:${session.userId}`;
  }

  return ipEmail(request, ip);
}

function ipEmail(request: Record<string, unknown>, ip: string): string {
  const body = request.body;
  const email =
    typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
      ? body.email.trim().toLowerCase().slice(0, 254)
      : 'anonymous';
  return `${ip}:${email}`;
}
