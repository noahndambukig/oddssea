/**
 * Where tokens live in the browser — and the honest tradeoff.
 *
 * Any token JavaScript can read, injected JavaScript (XSS) can also read.
 * Every browser storage option is exposed to that; they differ only in how
 * long the exposure lasts:
 *
 *   localStorage     survives restarts — largest window
 *   sessionStorage   cleared when the tab closes — smaller window
 *   memory only      gone on refresh — user re-authenticates constantly
 *   httpOnly cookie  unreadable by JS, but needs a server-side session
 *                    layer ("backend for frontend") and CSRF handling
 *
 * This uses sessionStorage, with the refresh token cut to ONE DAY on the
 * Cognito side. Deliberate, and gated: docs/decisions/0017 makes a
 * backend-for-frontend REQUIRED before the first Shell balance exists.
 * A skeleton with nothing to steal may choose simplicity; a ledger may not.
 */

const STORAGE_KEY = 'oddssea.tokens';

export interface TokenSet {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms, derived from expires_in at issue time. */
  expiresAt: number;
}

export function saveTokens(tokens: TokenSet): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function loadTokens(): TokenSet | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    clearTokens(); // corrupt or stale shape — drop it, don't crash startup
    return null;
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Treat tokens as expired a minute early, so one can't die in flight
 * between our check and the server reading it.
 */
const EXPIRY_SKEW_MS = 60_000;

export function isExpired(tokens: TokenSet): boolean {
  return Date.now() >= tokens.expiresAt - EXPIRY_SKEW_MS;
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
