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
 * VERIFIER — and keeps it locally. It sends only the SHA-256 hash of it —
 * the CODE CHALLENGE — with the login request. Cognito remembers the hash
 * and ties it to the code it issues. Cashing the code later requires
 * presenting the original verifier, which Cognito re-hashes and compares.
 *
 * A thief with the code but not the verifier has nothing. The hash is
 * one-way, so seeing the challenge in transit reveals nothing. And because
 * the secret is invented fresh per login instead of shipped in the bundle,
 * a browser app needs no permanent secret at all.
 */

/**
 * Base64URL: base64 with `-`/`_` instead of `+`/`/` and no `=` padding —
 * because these values travel inside URLs, where `+` and `/` mean things.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Cryptographically secure randomness — NOT Math.random(). */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * The secret that never leaves this browser. 32 random bytes → 43 base64url
 * characters (the spec allows 43–128) → ~256 bits of entropy.
 */
export function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

/**
 * The hash we are willing to show the world. `S256` in the spec's terms —
 * PKCE also permits `plain` (challenge = verifier), which protects against
 * nothing. Always S256.
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * CSRF protection. `state` is echoed back unchanged by Cognito; if what
 * returns doesn't match what we sent, this redirect did not come from a
 * login WE started, and we refuse it. Without this check an attacker can
 * complete a login of their own and have your app adopt the resulting
 * session ("login CSRF").
 */
export function createState(): string {
  return base64UrlEncode(randomBytes(16));
}
