/**
 * Where tokens live in the browser — now: NOWHERE PERSISTENT.
 *
 * Increment B kept them in sessionStorage and said so honestly: any token
 * JavaScript can read, injected JavaScript can read too, and the options
 * differ only in how long the exposure lasts. That was an acceptable trade
 * when there was nothing to steal.
 *
 * A Shell balance ends that trade, which is exactly what decisions/0017
 * gated on. So:
 *
 *   refresh token   an httpOnly cookie the browser cannot read at all,
 *                   set by the BFF (api/src/bff/). Not here. Not reachable
 *                   from this file or any other client code.
 *   access token    THIS MODULE, in a plain variable. Gone on refresh,
 *                   re-obtained from POST /auth/refresh using the cookie.
 *
 * A module-level variable rather than sessionStorage is the whole change,
 * and it is what makes `document.cookie` empty and devtools' Storage tab
 * boring. XSS can still read a token out of memory while the page runs —
 * nothing prevents that — but it can no longer take one that outlives the
 * tab, and it can never take the refresh token at all.
 */

export interface TokenSet {
  accessToken: string;
  idToken: string;
  /** Epoch ms, derived from expires_in at issue time. */
  expiresAt: number;
}

let tokens: TokenSet | null = null;

export function saveTokens(next: TokenSet): void {
  tokens = next;
}

export function loadTokens(): TokenSet | null {
  return tokens;
}

export function clearTokens(): void {
  tokens = null;
}

/**
 * Treat tokens as expired a minute early, so one cannot die in flight
 * between our check and the server reading it.
 */
const EXPIRY_SKEW_MS = 60_000;

export function isExpired(token: TokenSet): boolean {
  return Date.now() >= token.expiresAt - EXPIRY_SKEW_MS;
}

/**
 * Read a JWT's payload without verifying it — display only.
 *
 * A JWT is three base64url segments, header.payload.signature. The payload
 * is readable by anyone — it is signed, not encrypted, like a cheque:
 * contents visible, signature unforgeable. NEVER make a security decision
 * from a client-side decode; only a server verifying the signature against
 * Cognito's public keys can tell a real token from a pasted one.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
