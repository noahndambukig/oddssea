import { createCodeVerifier, createState, deriveCodeChallenge } from './pkce';
import {
  clearTokens,
  isExpired,
  loadTokens,
  saveTokens,
  type TokenSet,
} from './token-store';
import type { RuntimeConfig } from '../runtime-config';

/**
 * The Authorization Code + PKCE flow, start to finish:
 *
 *   1. beginLogin()     invent secrets, send the user to the login page
 *   2. (user authenticates on Cognito's hosted page)
 *   3. completeLogin()  Cognito redirects back with a code; swap it for tokens
 *   4. getAccessToken() a token that is definitely valid, refreshing if not
 *   5. logout()         drop local tokens AND end the Cognito session
 */

/**
 * The canonical scope string. Scopes come from what the authorize request
 * ASKS FOR, not from what the app client permits — a token minted without
 * `aws.cognito.signin.user.admin` cannot call the self-service user APIs,
 * and the 18+ attestation write fails at runtime.
 */
const SCOPES = 'openid email profile aws.cognito.signin.user.admin';

// The verifier and state must survive the full page navigation to Cognito
// and back, but not outlive the attempt. sessionStorage is that lifetime.
const VERIFIER_KEY = 'oddssea.pkce.verifier';
const STATE_KEY = 'oddssea.pkce.state';
const RETURN_TO_KEY = 'oddssea.pkce.returnTo';

function redirectUri(): string {
  // Must match a registered callback URL as an EXACT string — a trailing
  // slash is enough to be refused.
  return `${window.location.origin}/callback`;
}

/** Step 1 — note what is in this URL: the challenge (hash). Never the verifier. */
export async function beginLogin(
  config: RuntimeConfig,
  options: { signUp?: boolean; returnTo?: string } = {},
): Promise<void> {
  const verifier = createCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = createState();

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_TO_KEY, options.returnTo ?? '/');

  const params = new URLSearchParams({
    response_type: 'code', // never 'token' — that is the deprecated implicit grant
    client_id: config.userPoolClientId,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  // Cognito-specific: open the signup tab of the hosted page directly.
  if (options.signUp) params.set('screen_hint', 'signup');

  window.location.assign(`${config.cognitoDomain}/oauth2/authorize?${params}`);
}

export interface CompleteLoginResult {
  tokens: TokenSet;
  returnTo: string;
}

/** Step 3 — the URL looks like /callback?code=abc&state=xyz */
export async function completeLogin(
  config: RuntimeConfig,
  search: string,
): Promise<CompleteLoginResult> {
  const params = new URLSearchParams(search);

  // Cognito reports failures here rather than by HTTP status.
  const error = params.get('error');
  if (error) {
    const description = params.get('error_description');
    throw new Error(`Login failed: ${error}${description ? ` — ${description}` : ''}`);
  }

  const code = params.get('code');
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY) ?? '/';

  // Consumed immediately — single-use, like the code itself.
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);

  if (!code) throw new Error('No authorization code in the callback URL.');
  if (!verifier) {
    throw new Error(
      'No PKCE verifier found — the login was started in another tab or the ' +
        'tab closed partway through. Start again.',
    );
  }
  // The CSRF check. Refuse before spending the code.
  if (!returnedState || returnedState !== expectedState) {
    throw new Error('State mismatch — this redirect did not come from a login we started.');
  }

  const tokens = await exchange(config, {
    grant_type: 'authorization_code',
    client_id: config.userPoolClientId,
    code,
    redirect_uri: redirectUri(),
    // The proof: Cognito hashes this and compares it to the challenge it
    // stored when it issued the code.
    code_verifier: verifier,
  });

  saveTokens(tokens);
  return { tokens, returnTo };
}

/** Step 4 — null means "not logged in (any more)": show the sign-in button. */
export async function getAccessToken(config: RuntimeConfig): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (!isExpired(tokens)) return tokens.accessToken;
  return (await refreshTokens(config)) ? (loadTokens()?.accessToken ?? null) : null;
}

/**
 * Refresh unconditionally — used by the attestation gate, which needs an ID
 * token minted AFTER the attribute write (the stored one predates it and
 * never gains the claim on its own).
 */
export async function forceRefresh(config: RuntimeConfig): Promise<boolean> {
  return refreshTokens(config);
}

async function refreshTokens(config: RuntimeConfig): Promise<boolean> {
  const tokens = loadTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const refreshed = await exchange(config, {
      grant_type: 'refresh_token',
      client_id: config.userPoolClientId,
      refresh_token: tokens.refreshToken,
    });
    saveTokens(refreshed);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/**
 * Step 5 — logout is two things. Clearing sessionStorage logs the APP out;
 * Cognito still holds a session cookie on the auth domain and would wave
 * the next login straight through. Navigating to /logout ends that too.
 */
export function logout(config: RuntimeConfig): void {
  clearTokens();
  const params = new URLSearchParams({
    client_id: config.userPoolClientId,
    logout_uri: window.location.origin,
  });
  window.location.assign(`${config.cognitoDomain}/logout?${params}`);
}

/**
 * The token endpoint, shared by the initial exchange and every refresh.
 * Form-encoded, not JSON — OAuth 2.0 specifies it and Cognito enforces it.
 *
 * INVARIANT, inherited by every caller: a refresh-grant response carries no
 * new refresh token (rotation is off), so the stored one is ALWAYS carried
 * forward. A path that saved the response as-is would silently shrink the
 * one-day session to one hour — and nothing else would notice.
 */
async function exchange(
  config: RuntimeConfig,
  body: Record<string, string>,
): Promise<TokenSet> {
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Token endpoint returned ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    // The invariant: fall back to the refresh token we already hold.
    refreshToken: data.refresh_token ?? loadTokens()?.refreshToken ?? '',
    // expires_in is a duration in seconds; store the absolute instant.
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
