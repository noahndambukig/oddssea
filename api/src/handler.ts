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
import {
  CATALOGUE_VERSION,
  COMPLETION_BONUSES,
  CRATE_KINDS,
  CRATE_TABLES,
  DROP_TABLE_VERSION,
  GEAR_PAGES,
  PITY,
  SETS,
  SKIN_PAGES,
  STARTER_COMPOSITION,
  itemById,
  type CrateKind,
} from './catalogue';
import { buildOpen, type OpenSpec } from './crates';

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
  const id = await callFunction<string>(
    'upsert_player',
    { p_sub: sub, p_email: (claims.email as string) ?? null, p_attested_at: null },
    { casts: { p_attested_at: 'timestamptz' } },
  );

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

/**
 * The parameters open_crate() takes, in ITS declared order — callFunction
 * emits arguments positionally from key order, so this object's shape is
 * part of the call contract.
 */
function openCrateParams(playerId: string, key: string, spec: OpenSpec) {
  return {
    params: {
      p_player_id: playerId,
      p_idempotency_key: key,
      p_kind: spec.kind,
      p_target_set: spec.targetSet,
      p_tier_roll: spec.tierRoll,
      p_roll_max: spec.rollMax,
      p_rates: JSON.stringify(spec.rates),
      p_candidates: JSON.stringify(spec.candidates),
      p_price: spec.pricePearls,
      p_pity_threshold: spec.pityThreshold,
      p_drought_threshold: spec.droughtThreshold,
      p_drop_table_version: DROP_TABLE_VERSION,
      p_content_version: CATALOGUE_VERSION,
      p_dex_page_bonus: COMPLETION_BONUSES.dexPageShells,
      p_set_bonus: COMPLETION_BONUSES.setShells,
    },
    casts: {
      p_player_id: 'uuid',
      p_tier_roll: 'integer',
      p_roll_max: 'integer',
      p_rates: 'jsonb',
      p_candidates: 'jsonb',
      p_pity_threshold: 'integer',
      p_drought_threshold: 'integer',
    },
  };
}

interface OpenResult {
  catalogueId: string;
  [key: string]: unknown;
}

/** Names live in the catalogue, not the database — resolve them on the way out. */
function decorateOpen(open: OpenResult) {
  const item = itemById(open.catalogueId);
  return {
    ...open,
    item: {
      id: item.id,
      name: item.name,
      kind: item.kind,
      tier: item.tier,
      slot: item.slot,
      isKeystone: item.isKeystone,
    },
  };
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
        const attestedAt = await callFunction<string>(
          'set_attestation',
          { p_player_id: player.id, p_at: new Date().toISOString() },
          { casts: { p_player_id: 'uuid', p_at: 'timestamptz' } },
        );
        return toResult(json(200, { attestedAt }));
      }

      // ------------------------------------------------------- economics
      case 'POST /tasks/login-claim': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));
        const player = await currentPlayer(event);
        const result = await callFunction(
          'claim_login_task',
          { p_player_id: player.id, p_idempotency_key: key },
          { casts: { p_player_id: 'uuid' } },
        );
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
        }, {
          casts: {
            p_player_id: 'uuid',
            // The function declares these as `integer`. Every JS number goes
            // out as longValue, which Postgres reads as bigint, and it will
            // not implicitly NARROW bigint to integer when resolving an
            // overload — so the strongly-typed function is invisible again.
            p_threshold: 'integer',
            p_roll: 'integer',
            p_roll_max: 'integer',
          },
        });
        return toResult(json(200, result));
      }

      // ---------------------------------------------------------- crates
      case 'POST /crates/open': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));

        const body = JSON.parse(event.body ?? '{}') as { kind?: string; targetSet?: string };
        if (!body.kind || !CRATE_KINDS.includes(body.kind as CrateKind)) {
          return toResult(json(400, { error: 'unknown_crate_kind' }));
        }
        if (body.kind === 'set') {
          if (!body.targetSet || !SETS.some((s) => s.id === body.targetSet)) {
            return toResult(json(400, { error: 'unknown_target_set' }));
          }
        } else if (body.targetSet) {
          return toResult(json(400, { error: 'target_set_only_for_set_crates' }));
        }

        const player = await currentPlayer(event);

        // Every random draw this open could need is rolled HERE (CSPRNG,
        // the dice precedent) and passed in; the SQL function applies pity
        // and distinctness to it under the player lock and stores the whole
        // payload — the draws that lose to a pity override included.
        const spec = buildOpen(body.kind as CrateKind, body.targetSet);
        const call = openCrateParams(player.id, key, spec);
        const result = await callFunction<{ open: OpenResult; shells: number; pearls: number }>(
          'open_crate',
          call.params,
          { casts: call.casts },
        );
        return toResult(json(200, { ...result, open: decorateOpen(result.open) }));
      }

      case 'POST /crates/starter': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));

        const player = await currentPlayer(event);

        // 2 Basic Gear + 1 Basic Skin (currency-model.md's onboarding
        // grant): the composition that satisfies the first-session
        // guarantee by construction. The SQL function re-verifies it.
        const opens = STARTER_COMPOSITION.map((kind) => buildOpen(kind));
        const result = await callFunction<{ opens: OpenResult[]; shells: number; pearls: number }>(
          'claim_starter_crates',
          {
            p_player_id: player.id,
            p_idempotency_key: key,
            p_opens: JSON.stringify(opens),
            p_drop_table_version: DROP_TABLE_VERSION,
            p_content_version: CATALOGUE_VERSION,
            p_dex_page_bonus: COMPLETION_BONUSES.dexPageShells,
            p_set_bonus: COMPLETION_BONUSES.setShells,
          },
          { casts: { p_player_id: 'uuid', p_opens: 'jsonb' } },
        );
        return toResult(json(200, { ...result, opens: result.opens.map(decorateOpen) }));
      }

      case 'GET /collection': {
        const player = await currentPlayer(event);

        // Plain reads under the SELECT grants — no function needed. The
        // catalogue (names, pages, sets, prices, thresholds) is resolved
        // here in Node; the database holds only ownership and counters.
        const [items, dex, pity, claims] = await Promise.all([
          query<{ catalogue_id: string; source: string; state: string; acquired_at: string }>(
            `SELECT catalogue_id, source, state, acquired_at
               FROM items WHERE player_id = :id::uuid ORDER BY acquired_at`,
            { id: player.id },
          ),
          query<{ catalogue_id: string; first_owned_at: string | null }>(
            `SELECT catalogue_id, first_owned_at FROM dex_entries WHERE player_id = :id::uuid`,
            { id: player.id },
          ),
          query<{
            scope: string;
            target: string;
            legendary_counter: number;
            epic_drought: number;
            total_opens: number;
          }>(
            `SELECT scope, target, legendary_counter, epic_drought, total_opens
               FROM pity_counters WHERE player_id = :id::uuid`,
            { id: player.id },
          ),
          query<{ claim_key: string; amount: number }>(
            `SELECT claim_key, amount FROM one_time_claims WHERE player_id = :id::uuid`,
            { id: player.id },
          ),
        ]);

        const owned = new Set(
          dex.filter((d) => d.first_owned_at !== null).map((d) => d.catalogue_id),
        );
        const toPage = (page: { key: string; title: string; memberIds: string[] }) => ({
          key: page.key,
          title: page.title,
          total: page.memberIds.length,
          owned: page.memberIds.filter((id) => owned.has(id)).length,
          entries: page.memberIds.map((id) => {
            const item = itemById(id);
            return { id, name: item.name, tier: item.tier, owned: owned.has(id) };
          }),
        });

        return toResult(
          json(200, {
            starterClaimed: claims.some((c) => c.claim_key === 'starter_crates'),
            prices: Object.fromEntries(
              CRATE_KINDS.map((kind) => [kind, CRATE_TABLES[kind].pricePearls]),
            ),
            pity: {
              counters: pity,
              thresholds: {
                basicLegendary: PITY.basicLegendary,
                premiumLegendary: PITY.premiumLegendary,
                setKeystone: PITY.setKeystone,
                epicOrBetter: PITY.epicOrBetter,
              },
            },
            items: items.map((row) => {
              const item = itemById(row.catalogue_id);
              return {
                catalogueId: row.catalogue_id,
                name: item.name,
                kind: item.kind,
                tier: item.tier,
                slot: item.slot,
                isKeystone: item.isKeystone,
                source: row.source,
                state: row.state,
                acquiredAt: row.acquired_at,
              };
            }),
            gearPages: GEAR_PAGES.map(toPage),
            skinPages: SKIN_PAGES.map(toPage),
            sets: SETS.map((set) => ({
              id: set.id,
              name: set.name,
              total: set.memberIds.length,
              owned: set.memberIds.filter((id) => owned.has(id)).length,
              keystoneOwned: owned.has(set.keystoneId),
            })),
          }),
        );
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
    const rule =
      /already claimed|insufficient|has not attested|below minimum|no contest|must be claimed first/i.test(
        message,
      );
    if (rule) {
      // The database's message is the useful part; its wrapper is not. The
      // Data API returns "ERROR: already claimed today; SQLState: 23505" —
      // a player should see the sentence, not the SQLSTATE. Leaking internal
      // error codes to a UI is both noise and a small information leak.
      const clean = message
        .replace(/^ERROR:\s*/i, '')
        .replace(/;\s*SQLState:.*$/i, '')
        .trim();
      return toResult(json(400, { error: 'rule_violation', detail: clean }));
    }

    console.error('Unhandled error', error);
    return toResult(json(400, { error: 'request_failed' }));
  }
}
