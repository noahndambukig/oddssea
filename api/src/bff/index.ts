/**
 * The backend-for-frontend.
 *
 * decisions/0017 made this a blocking prerequisite of the first Shell
 * balance: tokens in sessionStorage were an honest trade when there was
 * nothing to steal, and a balance ends that argument. The browser now holds
 * the access token in memory only; the refresh token lives in an httpOnly
 * cookie it cannot read, and the PKCE exchange happens here.
 *
 * Four properties are load-bearing, and each exists because getting it wrong
 * is silent rather than loud:
 *
 *   ORDER THE IRREVERSIBLE STEP LAST. An OAuth code is single-use. The
 *   database is usually asleep. So we warm the database BEFORE spending the
 *   code — otherwise a cold start after the exchange strands the user with a
 *   spent code and no session.
 *
 *   STATE IS NOT A CREDENTIAL. It travels in the callback URL, so it reaches
 *   history, referers and logs. Replay requires state AND a binding secret
 *   held in an httpOnly cookie.
 *
 *   THE REDIRECT URI IS ALLOW-LISTED. An unvalidated redirect target is an
 *   open redirect and a token-theft primitive. It is also matched by Cognito
 *   as a whole string, so it must be the complete callback URI, not an origin.
 *
 *   ORIGIN CHECKS APPLY TO UNSAFE REQUESTS ONLY. Top-level navigations carry
 *   no Origin header, so enforcing it on /auth/login or the callback would
 *   reject every real login.
 */

import { callFunction, query, warm, withTransaction, DatabaseResumingError } from '../db';
import { createBindingSecret, createCodeVerifier, createState, deriveCodeChallenge } from './pkce';
import {
  clearCookie,
  json,
  parseCookies,
  redirect,
  setCookie,
  waitingPage,
  type HttpResponse,
} from './http';

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN!;
const CLIENT_ID = process.env.BFF_CLIENT_ID!;
const CLIENT_SECRET = process.env.BFF_CLIENT_SECRET!;
const APP_URL = process.env.APP_URL!;

const SESSION_COOKIE = 'oddssea_session';
const BINDING_COOKIE = 'oddssea_login';

/** Requested at authorize time — scopes come from the request, not the client. */
const SCOPES = 'openid email profile';

/**
 * The complete callback URIs Cognito has registered. Whole URIs, not origins:
 * Cognito matches redirect_uri as an exact string.
 */
function allowedCallbacks(): string[] {
  return [`${APP_URL}/auth/callback`, 'http://localhost:5173/auth/callback'];
}

function chooseCallback(requested: string | undefined): string {
  const allowed = allowedCallbacks();
  if (requested && allowed.includes(requested)) return requested;
  return allowed[0];
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * The BFF is a CONFIDENTIAL client, so it authenticates with a secret — which
 * is both the correct configuration and the reason a browser can never use
 * this client at all.
 */
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    throw new Error(`Token endpoint ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// ---------------------------------------------------------------- routes

export async function login(params: URLSearchParams): Promise<HttpResponse> {
  const redirectUri = chooseCallback(params.get('redirect_uri') ?? undefined);
  const returnTo = params.get('return_to') ?? '/';

  // Warm first: this route writes the attempt before redirecting, and a
  // navigation cannot retry a 503. Nothing has been consumed yet, so the
  // waiting page can simply re-request this exact URL.
  if (!(await warm())) {
    const self = new URL('/auth/login', APP_URL);
    self.search = params.toString();
    return waitingPage(self.toString());
  }

  const verifier = createCodeVerifier();
  const state = createState();
  const bindingSecret = createBindingSecret();

  await callFunction('create_login_attempt', {
    p_state: state,
    p_binding_secret: bindingSecret,
    p_code_verifier: verifier,
    p_redirect_uri: redirectUri,
    p_return_to: returnTo,
  });

  const authorize = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', SCOPES);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', deriveCodeChallenge(verifier));
  authorize.searchParams.set('code_challenge_method', 'S256');
  if (params.get('sign_up') === '1') authorize.searchParams.set('screen_hint', 'signup');

  return redirect(authorize.toString(), [
    setCookie(BINDING_COOKIE, bindingSecret, { maxAgeSeconds: 900, path: '/auth' }),
  ]);
}

export async function callback(
  params: URLSearchParams,
  cookieHeader: string | undefined,
): Promise<HttpResponse> {
  const error = params.get('error');
  if (error) {
    return redirect(`${APP_URL}/?auth_error=${encodeURIComponent(error)}`);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return json(400, { error: 'missing_code_or_state' });

  const bindingSecret = parseCookies(cookieHeader)[BINDING_COOKIE];
  if (!bindingSecret) {
    // No cookie means this callback cannot be tied to a login we started.
    return redirect(`${APP_URL}/?auth_error=missing_binding`);
  }

  // STEP 1 — warm, before the code is touched. If the cluster is still
  // waking, the code is still unspent, so re-requesting this URL is safe.
  if (!(await warm())) {
    const self = new URL('/auth/callback', APP_URL);
    self.search = params.toString();
    return waitingPage(self.toString());
  }

  // STEP 2 — decide whether to exchange at all. This validates the binding,
  // takes a lease, and short-circuits a replay by returning the session a
  // previous callback already created. It must run BEFORE the exchange:
  // checking afterwards would mean re-spending a single-use code every time.
  let claim: {
    status: string;
    code_verifier: string | null;
    redirect_uri: string | null;
    return_to: string | null;
    session_id: string | null;
  };
  try {
    const rows = await query<typeof claim>(
      'SELECT * FROM claim_login_attempt(:p_state, :p_binding_secret, 60)',
      { p_state: state, p_binding_secret: bindingSecret },
    );
    claim = rows[0];
  } catch {
    return redirect(`${APP_URL}/?auth_error=invalid_attempt`);
  }

  if (claim.status === 'completed' && claim.session_id) {
    // A duplicate callback — a refresh, a double-click, a retried navigation.
    // Return the same session rather than replaying a spent code.
    return redirect(`${APP_URL}${claim.return_to ?? '/'}`, [
      setCookie(SESSION_COOKIE, claim.session_id, { maxAgeSeconds: 86_400 }),
      clearCookie(BINDING_COOKIE, '/auth'),
    ]);
  }

  if (claim.status === 'busy') {
    return waitingPage(`${APP_URL}/auth/callback?${params.toString()}`, 2);
  }

  // STEP 3 — the irreversible step, now that everything else is in place.
  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: claim.redirect_uri!,
    code_verifier: claim.code_verifier!,
  });

  const idClaims = decodeClaims(tokens.id_token);

  // STEP 4 — the player and the session commit TOGETHER. A replay that
  // returned a session whose player row never persisted would be worse than
  // no session at all.
  const sessionId = await withTransaction(async (transactionId) => {
    const playerId = await callFunction<string>(
      'upsert_player',
      {
        p_sub: String(idClaims.sub),
        p_email: (idClaims.email as string) ?? null,
        // Backfill-only inside the function: a later login carries no
        // attestation claim, and must not erase the database's value.
        p_attested_at: (idClaims['custom:age_attested_at'] as string) ?? null,
      },
      { transactionId },
    );

    return callFunction<string>(
      'complete_login_attempt',
      {
        p_state: state,
        p_player_id: playerId,
        p_refresh_token: tokens.refresh_token ?? '',
        p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      { transactionId },
    );
  });

  return redirect(`${APP_URL}${claim.return_to ?? '/'}`, [
    setCookie(SESSION_COOKIE, sessionId, { maxAgeSeconds: 86_400 }),
    clearCookie(BINDING_COOKIE, '/auth'),
  ]);
}

/**
 * Exchange the session cookie for a fresh access token.
 *
 * The browser calls this by fetch, so it is an "unsafe request" in the sense
 * that matters here — it CAN carry an Origin header, so it is checked. The
 * access token is returned in the body and held in memory only; the refresh
 * token never leaves this function.
 */
export async function refresh(
  cookieHeader: string | undefined,
  origin: string | undefined,
): Promise<HttpResponse> {
  if (origin && origin !== APP_URL && !origin.startsWith('http://localhost:5173')) {
    return json(401, { error: 'bad_origin' });
  }

  const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!sessionId) return json(401, { error: 'no_session' });

  let session: { player_id: string; cognito_sub: string; refresh_token: string };
  try {
    const rows = await query<typeof session>(
      'SELECT * FROM read_session(:p_session_id)',
      { p_session_id: sessionId },
    );
    if (!rows.length) return json(401, { error: 'session_expired' });
    session = rows[0];
  } catch (e) {
    if (e instanceof DatabaseResumingError) throw e;
    return json(401, { error: 'session_invalid' });
  }

  const tokens = await tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: session.refresh_token,
  });

  return json(200, {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    expiresIn: tokens.expires_in,
  });
}

export async function logout(
  cookieHeader: string | undefined,
  origin: string | undefined,
): Promise<HttpResponse> {
  if (origin && origin !== APP_URL && !origin.startsWith('http://localhost:5173')) {
    return json(401, { error: 'bad_origin' });
  }

  const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (sessionId) {
    const rows = await query<{ refresh_token: string }>(
      'SELECT * FROM read_session(:p_session_id)',
      { p_session_id: sessionId },
    ).catch(() => []);

    // Revoke server-side before dropping our own record — otherwise the
    // refresh token outlives the sign-out, which is the gap Increment C
    // found and fixed in the old client.
    if (rows[0]?.refresh_token) {
      const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      await fetch(`${COGNITO_DOMAIN}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ token: rows[0].refresh_token }),
      }).catch(() => undefined);
    }

    await callFunction('delete_session', { p_session_id: sessionId }).catch(() => undefined);
  }

  return { ...json(200, { ok: true }), cookies: [clearCookie(SESSION_COOKIE)] };
}
