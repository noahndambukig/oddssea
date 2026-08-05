/**
 * The whole API, one Lambda.
 *
 * Two routes share this handler and it branches on the route key. That is a
 * deliberate teaching choice, not an architecture: with one file there is
 * exactly one place to look, and the interesting part — WHO verified the
 * token — stays visible. (When the API grows real surface area, this becomes
 * one function per route, or a router; splitting is mechanical.)
 *
 * The most important thing about this file is what is NOT in it:
 *
 *   There is no JWT verification code here. No signature check, no issuer
 *   check, no expiry check, no JWKS fetch.
 *
 * All of that happened at API Gateway, before this function was invoked —
 * the JWT authorizer configured in infra/lib/constructs/api.ts verified the
 * token's signature against the user pool's public keys (JWKS), checked the
 * issuer, audience, expiry, and required scope, and REJECTED the request
 * outright if any of it failed. A rejected request never reaches this code,
 * never starts a Lambda, never costs compute. The proof is in the log group:
 * a 401 leaves no trace here.
 *
 * So when this code reads claims out of the request context, it is not
 * "trusting the client" — the client cannot write requestContext. It is
 * trusting API Gateway, which sits in front of every invocation and already
 * did the cryptography. That handoff — verify at the edge, trust the
 * context inside — is the standard shape of a gateway-authorized API.
 */

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

/** Uniform JSON response — the gateway passes status and body through. */
function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  switch (event.routeKey) {
    // Public: no authorizer on this route, so event.requestContext.authorizer
    // is absent here at runtime. Anyone — signed in or not — gets a 200.
    // Exists so "the API is up" and "your token works" are separately
    // observable facts.
    case 'GET /health':
      return json(200, { ok: true });

    // Protected: the JWT authorizer ran before this invocation. The claims
    // below are from the ACCESS token, and what they contain is a lesson in
    // itself: sub (who), client_id (which app — where an ID token would
    // carry `aud` instead), token_use ("access" — the authorizer's scope
    // requirement is what keeps an ID token out), scope, iat/exp. There is
    // deliberately NO email here — email lives only on the ID token, which
    // the browser already holds. Identity comes from the access token;
    // profile comes from the ID token. Two tokens, two jobs.
    case 'GET /me': {
      const claims = event.requestContext.authorizer.jwt.claims;
      return json(200, {
        sub: claims.sub,
        tokenUse: claims.token_use,
        clientId: claims.client_id,
        scope: claims.scope,
        issuedAt: claims.iat,
        expiresAt: claims.exp,
      });
    }

    // Unreachable while API Gateway only routes the two keys above — but
    // routes and code evolve separately, so the mismatch case is explicit
    // rather than an implicit undefined.
    default:
      return json(404, { message: `No handler for ${event.routeKey}` });
  }
}
