/**
 * PKCE — Proof Key for Code Exchange (RFC 7636).
 *
 * ## The problem
 *
 * The Authorization Code flow hands the browser a one-time `code` in the
 * redirect URL. A server-side app proves it deserves to cash that code by
 * sending a client secret. A browser app CANNOT hold a secret — everything
 * it ships is readable in devtools — and the code travels through URLs,
 * history and redirect chains where it can leak. If the code alone buys
 * tokens, stealing it is enough.
 *
 * ## The fix
 *
 * Before starting, the app invents a large random secret — the CODE
 * VERIFIER — and keeps it. It sends only the SHA-256 hash of it — the CODE
 * CHALLENGE — with the login request. Cognito remembers the hash and ties it
 * to the code it issues. Cashing the code later requires presenting the
 * original verifier, which Cognito re-hashes and compares.
 *
 * A thief with the code but not the verifier has nothing. The hash is
 * one-way, so seeing the challenge in transit reveals nothing.
 *
 * ## Why this file now lives on the server
 *
 * It was written for the browser in Increment B, and the logic is unchanged.
 * What changed is who keeps the verifier: with a backend-for-frontend, the
 * exchange happens server-side (docs/decisions/0017), so the verifier lives
 * in `login_attempts` and never reaches the client at all.
 *
 * PKCE is still worth having here. A confidential client with a secret is
 * already protected against a stolen code, but PKCE also defends against
 * code injection — an attacker who tricks the browser into carrying THEIR
 * code into YOUR session. Belt and braces, and it costs nothing.
 *
 * Node's `crypto` replaces the browser's WebCrypto; the values are identical.
 */

import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';

/**
 * Base64URL: base64 with `-`/`_` instead of `+`/`/` and no `=` padding —
 * because these values travel inside URLs, where `+` and `/` mean things.
 */
function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The secret that never leaves the server. 32 random bytes → 43 base64url
 * characters (the spec allows 43–128) → ~256 bits of entropy.
 */
export function createCodeVerifier(): string {
  return base64Url(nodeRandomBytes(32));
}

/**
 * The hash we are willing to show the world. `S256` in the spec's terms —
 * PKCE also permits `plain` (challenge = verifier), which protects against
 * nothing. Always S256.
 */
export function deriveCodeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

/**
 * CSRF protection. `state` is echoed back unchanged by Cognito; if what
 * returns doesn't match what we sent, this redirect did not come from a
 * login WE started. Note that state alone is NOT sufficient here — it
 * travels in a URL, so it lands in history, referers and server logs. The
 * callback additionally requires a binding secret held in an httpOnly
 * cookie, so a leaked state cannot replay someone else's session.
 */
export function createState(): string {
  return base64Url(nodeRandomBytes(16));
}

/** The cookie-held half of the replay binding. Never appears in a URL. */
export function createBindingSecret(): string {
  return base64Url(nodeRandomBytes(32));
}
