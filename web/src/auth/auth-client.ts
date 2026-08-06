import { clearTokens, isExpired, loadTokens, saveTokens } from './token-store';
import type { RuntimeConfig } from '../runtime-config';

/**
 * The client half of the backend-for-frontend.
 *
 * This file used to run the whole OAuth flow — PKCE, the code exchange, the
 * refresh grant — about 250 lines of it. All of that moved to the server
 * (api/src/bff/) when decisions/0017's gate came due, so what is left is
 * small on purpose:
 *
 *   login()            navigate to /auth/login and let the BFF drive
 *   getAccessToken()   return a live token, refreshing via the cookie
 *   logout()           POST /auth/logout, which revokes and clears
 *
 * Note what is absent: no verifier, no code, no refresh token, no token
 * endpoint. The browser never sees any of them. `pkce.ts` was not deleted —
 * it moved to api/src/bff/pkce.ts, because it is still the clearest
 * explanation of what PKCE is for.
 */

/** Same-origin: CloudFront routes /auth/* to the API, so cookies are first-party. */
const AUTH_BASE = '/auth';

export function login(options: { signUp?: boolean; returnTo?: string } = {}): void {
  const params = new URLSearchParams({
    redirect_uri: `${window.location.origin}/auth/callback`,
    return_to: options.returnTo ?? window.location.pathname,
  });
  if (options.signUp) params.set('sign_up', '1');
  window.location.assign(`${AUTH_BASE}/login?${params}`);
}

/**
 * Thrown when the database is still waking. Callers render the waking state
 * and retry — with the SAME Idempotency-Key if the call was economic.
 */
export class ResumingError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Database is waking up');
    this.name = 'ResumingError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function refresh(): Promise<boolean> {
  const response = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    // The session cookie is httpOnly, so this is the only way it travels.
    credentials: 'same-origin',
  });

  if (response.status === 503) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 5);
    throw new ResumingError(retryAfter);
  }
  if (!response.ok) {
    clearTokens();
    return false;
  }

  const data = (await response.json()) as {
    accessToken: string;
    idToken: string;
    expiresIn: number;
  };
  saveTokens({
    accessToken: data.accessToken,
    idToken: data.idToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
  });
  return true;
}

/** A token that is definitely valid, or null if there is no session. */
export async function getAccessToken(): Promise<string | null> {
  const current = loadTokens();
  if (current && !isExpired(current)) return current.accessToken;
  return (await refresh()) ? (loadTokens()?.accessToken ?? null) : null;
}

export async function logout(config: RuntimeConfig): Promise<void> {
  clearTokens();
  // Revokes the refresh token server-side and clears the session cookie.
  await fetch(`${AUTH_BASE}/logout`, {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => undefined);

  // Second half of logout: end Cognito's own session, or the next sign-in
  // sails through without a password.
  const params = new URLSearchParams({
    client_id: config.userPoolClientId,
    logout_uri: window.location.origin,
  });
  window.location.assign(`${config.cognitoDomain}/logout?${params}`);
}
