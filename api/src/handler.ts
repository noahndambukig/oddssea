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
  SLOTS,
  STARTER_COMPOSITION,
  itemById,
  type CrateKind,
  type Slot,
} from './catalogue';
import { buildOpen, type OpenSpec } from './crates';
import {
  AMOUNTS,
  FEATURE_FIRSTS,
  TARGETS,
  TOUR_STEPS,
  dailyDraw,
  utcToday,
  utcWeekStart,
  type PoolEntry,
} from './tasks';

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
    first_equipped_at: string | null;
  }>(
    `SELECT id, shells_balance, pearls_balance, age_attested_at, streak_run, last_claim_date,
            first_equipped_at
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
    first_equipped_at: null,
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

/**
 * One task claim, dispatched to the right SQL function with the numbers
 * from the shipping copy. The rollover retry lives here: the SQL function
 * verifies the date parameter against its own clock and RAISEs "day/week
 * rolled over" when stale — this recomputes and retries ONCE with the
 * SAME idempotency key (same economic action; the RAISE guarantees
 * nothing committed). The client never sees the midnight window.
 */
async function claimTask(playerId: string, key: string, taskKey: string): Promise<unknown> {
  const attempt = () => {
    if (taskKey === 'first_bet' || taskKey.startsWith('challenge:')) {
      const today = utcToday();
      const draw = dailyDraw(today);
      const entry = draw.find((e) => e.key === taskKey);
      return callFunction(
        'claim_daily_task',
        {
          p_player_id: playerId,
          p_idempotency_key: key,
          p_task_key: taskKey,
          p_claim_date: today,
          p_draw: JSON.stringify(draw.map((e) => e.key)),
          p_target: entry?.target ?? 1,
          p_amount: taskKey === 'first_bet' ? AMOUNTS.firstBet : AMOUNTS.challenge,
        },
        {
          casts: {
            p_player_id: 'uuid',
            p_claim_date: 'date',
            p_draw: 'jsonb',
            p_target: 'integer',
          },
        },
      );
    }
    if (taskKey === 'weekly:volume' || taskKey === 'weekly:consistency') {
      const volume = taskKey === 'weekly:volume';
      return callFunction(
        'claim_weekly_task',
        {
          p_player_id: playerId,
          p_idempotency_key: key,
          p_task_key: taskKey,
          p_week_start: utcWeekStart(),
          p_target: volume ? TARGETS.weeklyVolumeBets : TARGETS.weeklyConsistencyDays,
          p_set_challenges: volume ? null : TARGETS.dailySetChallenges,
          p_amount: volume ? AMOUNTS.weeklyVolume : AMOUNTS.weeklyConsistency,
        },
        {
          casts: {
            p_player_id: 'uuid',
            p_week_start: 'date',
            p_target: 'integer',
            p_set_challenges: 'integer',
          },
        },
      );
    }
    return callFunction(
      'claim_one_time_task',
      {
        p_player_id: playerId,
        p_idempotency_key: key,
        p_claim_key: taskKey,
        p_amount: taskKey.startsWith('tour:')
          ? AMOUNTS.tourStep
          : taskKey === 'first_equip'
            ? AMOUNTS.featureFirst
            : AMOUNTS.firstBetGame,
      },
      { casts: { p_player_id: 'uuid' } },
    );
  };

  try {
    return await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/day rolled over|week rolled over/i.test(message)) {
      return await attempt();
    }
    throw error;
  }
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

      // ----------------------------------------------------------- tasks
      case 'GET /tasks': {
        const player = await currentPlayer(event);
        const today = utcToday();
        const weekStart = utcWeekStart();
        const draw = dailyDraw(today);

        const [betAgg, weekClaims, oneTimes] = await Promise.all([
          query<{
            bets_today: number;
            wins_today: number;
            bets_week: number;
            bets_ever: number;
            bets_dice: number;
          }>(
            `SELECT
               COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC')::date = :today::date) AS bets_today,
               COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC')::date = :today::date AND payout > 0) AS wins_today,
               COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC')::date >= :week::date
                                  AND (created_at AT TIME ZONE 'UTC')::date < :week::date + 7) AS bets_week,
               COUNT(*) AS bets_ever,
               COUNT(*) FILTER (WHERE game = 'dice') AS bets_dice
               FROM bets WHERE player_id = :id::uuid`,
            { id: player.id, today, week: weekStart },
          ),
          query<{ task_key: string; claim_date: string }>(
            `SELECT task_key, claim_date FROM task_claims
              WHERE player_id = :id::uuid AND claim_date >= :week::date`,
            { id: player.id, week: weekStart },
          ),
          query<{ claim_key: string }>(
            `SELECT claim_key FROM one_time_claims WHERE player_id = :id::uuid`,
            { id: player.id },
          ),
        ]);

        const agg = betAgg[0] ?? { bets_today: 0, wins_today: 0, bets_week: 0, bets_ever: 0, bets_dice: 0 };
        const claimedToday = new Set(
          weekClaims.filter((c) => c.claim_date === today).map((c) => c.task_key),
        );
        const claimedWeek = new Set(
          weekClaims.filter((c) => c.claim_date === weekStart).map((c) => c.task_key),
        );
        const owned = new Set(oneTimes.map((c) => c.claim_key));
        const starterClaimed = owned.has('starter_crates');

        // Qualifying days for the consistency weekly — mirrors the SQL
        // condition, for display only (the function recounts at claim).
        const byDay = new Map<string, { login: boolean; firstBet: boolean; challenges: number }>();
        for (const c of weekClaims) {
          if (c.task_key.startsWith('weekly:')) continue;
          const day = byDay.get(c.claim_date) ?? { login: false, firstBet: false, challenges: 0 };
          if (c.task_key === 'login') day.login = true;
          else if (c.task_key === 'first_bet') day.firstBet = true;
          else if (c.task_key.startsWith('challenge:')) day.challenges += 1;
          byDay.set(c.claim_date, day);
        }
        const qualifyingDays = [...byDay.values()].filter(
          (d) => d.login && d.firstBet && d.challenges >= TARGETS.dailySetChallenges,
        ).length;

        const challengeProgress = (entry: PoolEntry) =>
          entry.key === 'challenge:win_bet'
            ? Math.min(Number(agg.wins_today) > 0 ? 1 : 0, entry.target)
            : Math.min(Number(agg.bets_today), entry.target);

        // Claimable flags read the SAME evidence as the SQL conditions:
        // equip credit is players.first_equipped_at (an event timestamp),
        // never the live loadout. tour:first-bet's UI gate presents the
        // spec's order (after equip) even while SQL stays permissive
        // until 010 lands next milestone.
        const hasEquipped = player.first_equipped_at !== null;
        const tourClaimable: Record<string, boolean> = {
          'tour:economy-intro': true,
          'tour:starter-crates': owned.has('tour:economy-intro') && starterClaimed,
          'tour:equip': owned.has('tour:starter-crates') && hasEquipped,
          'tour:first-bet': owned.has('tour:equip') && Number(agg.bets_ever) > 0,
        };

        return toResult(
          json(200, {
            date: today,
            weekStart,
            starterClaimed,
            daily: [
              {
                key: 'first_bet',
                name: 'First bet of the day',
                amount: AMOUNTS.firstBet,
                target: 1,
                progress: Number(agg.bets_today) > 0 ? 1 : 0,
                claimed: claimedToday.has('first_bet'),
              },
              ...draw.map((entry) => ({
                key: entry.key,
                name: entry.name,
                amount: AMOUNTS.challenge,
                target: entry.target,
                progress: challengeProgress(entry),
                claimed: claimedToday.has(entry.key),
              })),
            ],
            weekly: [
              {
                key: 'weekly:consistency',
                name: 'Complete daily sets on 4 different days',
                amount: AMOUNTS.weeklyConsistency,
                target: TARGETS.weeklyConsistencyDays,
                progress: qualifyingDays,
                claimed: claimedWeek.has('weekly:consistency'),
              },
              {
                key: 'weekly:volume',
                name: 'Place 100 bets this week',
                amount: AMOUNTS.weeklyVolume,
                target: TARGETS.weeklyVolumeBets,
                progress: Math.min(Number(agg.bets_week), TARGETS.weeklyVolumeBets),
                claimed: claimedWeek.has('weekly:volume'),
              },
            ],
            oneTime: [
              ...TOUR_STEPS.map((step) => ({
                key: step.key,
                name: step.name,
                amount: AMOUNTS.tourStep,
                claimed: owned.has(step.key),
                claimable: !owned.has(step.key) && tourClaimable[step.key],
              })),
              {
                key: 'first_bet:dice',
                name: 'First dice bet',
                amount: AMOUNTS.firstBetGame,
                claimed: owned.has('first_bet:dice'),
                claimable: !owned.has('first_bet:dice') && Number(agg.bets_dice) > 0,
              },
              ...FEATURE_FIRSTS.map((f) => ({
                key: f.key,
                name: f.name,
                amount: AMOUNTS.featureFirst,
                claimed: owned.has(f.key),
                claimable: !owned.has(f.key) && hasEquipped,
              })),
            ],
          }),
        );
      }

      case 'POST /tasks/claim': {
        const key = idempotencyKey(event);
        if (!key) return toResult(json(400, { error: 'idempotency_key_required' }));

        const body = JSON.parse(event.body ?? '{}') as { taskKey?: string };
        const valid = new Set([
          'first_bet',
          ...dailyDraw(utcToday()).map((e) => e.key),
          'weekly:volume',
          'weekly:consistency',
          ...TOUR_STEPS.map((s) => s.key),
          'first_bet:dice',
          ...FEATURE_FIRSTS.map((f) => f.key),
        ]);
        if (!body.taskKey || !valid.has(body.taskKey)) {
          return toResult(json(400, { error: 'unknown_task_key' }));
        }

        const player = await currentPlayer(event);
        const result = await claimTask(player.id, key, body.taskKey);
        return toResult(json(200, result));
      }

      // ---------------------------------------------------------- closet
      case 'POST /closet/equip': {
        const body = JSON.parse(event.body ?? '{}') as {
          slot?: string;
          gearItemId?: string | null;
          skinItemId?: string | null;
        };
        if (!body.slot || !SLOTS.includes(body.slot as Slot)) {
          return toResult(json(400, { error: 'unknown_slot' }));
        }

        const player = await currentPlayer(event);

        // Slot-fit is catalogue knowledge and is enforced HERE: the item's
        // catalogue entry must occupy the requested slot (keystones carry
        // their keystone_slot in the catalogue, so they fit shirt with no
        // special case). Ownership, kind and state — the unforgeable
        // checks — are re-verified inside set_equipment.
        const ids = [body.gearItemId, body.skinItemId].filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
        if (ids.length) {
          const rows = await query<{ id: string; catalogue_id: string; kind: string }>(
            `SELECT id, catalogue_id, kind FROM items
              WHERE player_id = :player::uuid AND id = ANY(string_to_array(:ids, ',')::uuid[])`,
            { player: player.id, ids: ids.join(',') },
          );
          for (const wanted of ids) {
            const row = rows.find((r) => r.id === wanted);
            if (!row) return toResult(json(400, { error: 'unknown_item' }));
            const item = itemById(row.catalogue_id);
            if (item.slot !== body.slot) return toResult(json(400, { error: 'wrong_slot' }));
            const axis = wanted === body.gearItemId ? 'gear' : 'skin';
            if (item.kind !== axis) return toResult(json(400, { error: 'wrong_item_kind' }));
          }
        }

        const result = await callFunction<{
          slot: string;
          gearItemId: string | null;
          skinItemId: string | null;
          firstEquippedAt: string | null;
        }>(
          'set_equipment',
          {
            p_player_id: player.id,
            p_slot: body.slot,
            p_gear_item_id: body.gearItemId ?? null,
            p_skin_item_id: body.skinItemId ?? null,
          },
          {
            casts: {
              p_player_id: 'uuid',
              p_gear_item_id: 'uuid',
              p_skin_item_id: 'uuid',
            },
          },
        );
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
        const [items, dex, pity, claims, loadouts] = await Promise.all([
          query<{ id: string; catalogue_id: string; source: string; state: string; acquired_at: string }>(
            `SELECT id, catalogue_id, source, state, acquired_at
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
          query<{ slot: string; gear_item_id: string | null; skin_item_id: string | null }>(
            `SELECT slot, gear_item_id, skin_item_id FROM loadouts
              WHERE player_id = :id::uuid AND preset = 1`,
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
                // The instance id — the closet equips INSTANCES, and this
                // is what /closet/equip takes.
                itemId: row.id,
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
            equipment: Object.fromEntries(
              SLOTS.map((slot) => {
                const row = loadouts.find((l) => l.slot === slot);
                const decorate = (instanceId: string | null) => {
                  if (!instanceId) return null;
                  const owned = items.find((i) => i.id === instanceId);
                  if (!owned) return null;
                  const item = itemById(owned.catalogue_id);
                  return { itemId: instanceId, catalogueId: owned.catalogue_id, name: item.name, tier: item.tier };
                };
                return [slot, {
                  gear: decorate(row?.gear_item_id ?? null),
                  skin: decorate(row?.skin_item_id ?? null),
                }];
              }),
            ),
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
      /already claimed|insufficient|has not attested|below minimum|no contest|must be claimed first|not yet complete|not in today|rolled over|not owned/i.test(
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
