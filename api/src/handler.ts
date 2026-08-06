/**
 * The whole API, one Lambda.
 *
 * Two kinds of route live here and they authenticate differently:
 *
 *   /auth/*   the backend-for-frontend. NO JWT authorizer — these routes are
 *             how you get a token in the first place. They authenticate with
 *             cookies and the Cognito client secret.
 *
 *   the rest  behind API Gateway's JWT authorizer. By the time this code
 *             runs, the token's signature, issuer, audience, expiry and
 *             scope have all been checked at the front door, and a rejected
 *             request never started a Lambda at all.
 *
 * What is NOT in this file is still the most important thing about it: no
 * signature verification, and no SQL that writes anything. Every write goes
 * through a SECURITY DEFINER function, because the database role this
 * connects as holds EXECUTE and no table write privilege — so "can the API
 * corrupt a balance" has a structural answer rather than a careful one.
 */

import { randomInt } from 'node:crypto';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { callFunction, query, DatabaseResumingError } from './db';
import * as bff from './bff';
import { json, resuming, type HttpResponse } from './bff/http';

/** The content version stamped on every logged roll (data-model.md rule 5). */
const CONTENT_VERSION = process.env.CONTENT_VERSION ?? '1.1.0';

/** Dice rolls 1..100. Stored with the bet, because a roll without its range means nothing. */
const ROLL_MAX = 100;

function toResult(response: HttpResponse): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    cookies: response.cookies,
    body: response.body,
  };
}

/** The player row for the authenticated caller, created on first sight. */
async function currentPlayer(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const claims = event.requestContext.authorizer.jwt.claims;
  const sub = String(claims.sub);

  const rows = await query<{
    id: string;
    shells_balance: number;
    pearls_balance: number;
    age_attested_at: string | null;
    streak_run: number;
    last_claim_date: string | null;
  }>(
    `SELECT id, shells_balance, pearls_balance, age_attested_at, streak_run, last_claim_date
       FROM players WHERE cognito_sub = :sub`,
    { sub },
  );

  if (rows.length) return rows[0];

  // Lazy provisioning: no Cognito trigger, no ordering race, and it works
  // for accounts that existed before this milestone.
  const id = await callFunction<string>('upsert_player', {
    p_sub: sub,
    p_email: (claims.email as string) ?? null,
    p_attested_at: null,
  });

  return {
    id,
    shells_balance: 0,
    pearls_balance: 0,
    age_attested_at: null,
    streak_run: 0,
    last_claim_date: null,
  };
}

function idempotencyKey(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | null {
  const headers = event.headers ?? {};
  const key = headers['idempotency-key'] ?? headers['Idempotency-Key'];
  return key ?? null;
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const params = new URLSearchParams(event.rawQueryString ?? '');
  const cookieHeader = (event.cookies ?? []).join('; ') || undefined;
  const origin = (event.headers ?? {})['origin'];

  /**
   * Route on the ACTUAL path, not `event.routeKey`.
   *
   * API Gateway reports routeKey as the pattern that was REGISTERED — for a
   * proxy route that is literally `GET /auth/{proxy+}`, never
   * `GET /auth/login`. Switching on routeKey therefore works for exact
   * routes and silently falls through to the default for every proxy one,
   * which is exactly what happened on the first deploy: /auth/login
   * answered 400 instead of redirecting to Cognito.
   *
   * `rawPath` is what the caller actually asked for, so one key handles
   * both kinds of route.
   */
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  const route = `${method} ${path}`;

  try {
    switch (route) {
      // ---------------------------------------------------------- public
      case 'GET /health':
        return toResult(json(200, { ok: true }));

      // ------------------------------------------------------------- BFF
      case 'GET /auth/login':
        return toResult(await bff.login(params));
      case 'GET /auth/callback':
        return toResult(await bff.callback(params, cookieHeader));
      case 'POST /auth/refresh':
        return toResult(await bff.refresh(cookieHeader, origin));
      case 'POST /auth/logout':
        return toResult(await bff.logout(cookieHeader, origin));

      // -------------------------------------------------------- identity
      case 'GET /me': {
        const claims = event.requestContext.authorizer.jwt.claims;
        const player = await currentPlayer(event);
        return toResult(
          json(200, {
            sub: claims.sub,
            tokenUse: claims.token_use,
            attestedAt: player.age_attested_at,
            shells: player.shells_balance,
            pearls: player.pearls_balance,
            streak: player.streak_run,
            lastClaimDate: player.last_claim_date,
          }),
        );
      }

      case 'POST /me/attest': {
        // The compliance gate is enforced HERE, not by the UI rendering a
        // screen. A client that skips the screen skips nothing.
        const player = await currentPlayer(event);
        const attestedAt = await callFunction<string>('set_attestation', {
          p_player_id: player.id,
          p_at: new Date().toISOString(),
        });
        return toResult(json(200, { attestedAt }));
      }

      // ------------------------------------------------------- economics
      case 'POST /tasks/login-claim': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));
        const player = await currentPlayer(event);
        const result = await callFunction('claim_login_task', {
          p_player_id: player.id,
          p_idempotency_key: key,
        });
        return toResult(json(200, result));
      }

      case 'POST /bets/dice': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));

        const body = JSON.parse(event.body ?? '{}') as {
          stake?: number;
          direction?: string;
          threshold?: number;
        };
        if (!body.stake || !body.direction || !body.threshold) {
          return toResult(json(400, { error: 'stake_direction_threshold_required' }));
        }

        const player = await currentPlayer(event);

        // The roll is generated HERE and passed in, so the value that
        // decided the outcome is the value stored — a CSPRNG, not
        // Math.random (decisions/0015).
        const roll = randomInt(1, ROLL_MAX + 1);

        const result = await callFunction('place_dice_bet', {
          p_player_id: player.id,
          p_idempotency_key: key,
          p_stake: Math.floor(body.stake),
          p_direction: body.direction,
          p_threshold: Math.floor(body.threshold),
          p_roll: roll,
          p_roll_max: ROLL_MAX,
          p_content_version: CONTENT_VERSION,
        });
        return toResult(json(200, result));
      }

      default:
        return toResult(json(400, { error: `no_handler_for_${route}` }));
    }
  } catch (error) {
    // A resuming cluster is an expected state, not a failure. The client
    // retries with the same Idempotency-Key, which is why that header is
    // required on every economic route.
    if (error instanceof DatabaseResumingError) {
      return toResult(resuming(error.retryAfterSeconds));
    }

    // Errors raised by the SQL functions are player-facing rules, not bugs:
    // "already claimed today", "insufficient shells", "player has not
    // attested". Surfacing the message is deliberate.
    const message = error instanceof Error ? error.message : String(error);
    const rule = /already claimed|insufficient|has not attested|below minimum|no contest/i.test(
      message,
    );
    if (rule) return toResult(json(400, { error: 'rule_violation', detail: message }));

    console.error('Unhandled error', error);
    return toResult(json(400, { error: 'request_failed' }));
  }
}
