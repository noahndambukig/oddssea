/**
 * The task system's definitions and the daily draw.
 *
 * Numbers come from the shipping copy (docs/01-game/data/tasks.json —
 * currency-model.md is the doc of record) and leave here only as function
 * parameters; nothing below hardcodes an amount or a target.
 *
 * The draw is SHARED and STATELESS: every player sees the same slate on a
 * given UTC date because the slate is a pure function of the date — a
 * hash-seeded selection, not a stored roll. Two properties make that safe:
 *
 *   1. `available_from` on every pool entry. A deploy that grows the pool
 *      cannot reshuffle the day already in progress, because today's
 *      filter ignores entries dated later — "same date, same draw" is an
 *      invariant, not an accident of deploy timing.
 *   2. The seeded shuffle uses sha256 of the date, not Math.random or
 *      crypto.randomInt — determinism IS the feature here, unlike the
 *      crate rolls where unpredictability is.
 */

import { createHash } from 'node:crypto';
import tasksData from '../../docs/01-game/data/tasks.json';

export interface PoolEntry {
  key: string;
  kind: 'volume' | 'outcome';
  target: number;
  name: string;
  availableFrom: string;
}

export const POOL: readonly PoolEntry[] = tasksData.challenges.pool.map((p) => ({
  key: p.key,
  kind: p.kind as 'volume' | 'outcome',
  target: p.target,
  name: p.name,
  availableFrom: p.available_from,
}));

export const AMOUNTS = {
  firstBet: tasksData.daily.first_bet.amount_shells,
  challenge: tasksData.challenges.amount_shells,
  weeklyConsistency: tasksData.weekly.consistency.amount_shells,
  weeklyVolume: tasksData.weekly.volume.amount_shells,
  tourStep: tasksData.one_time.tour_step_shells,
  firstBetGame: tasksData.one_time.first_bet_game_shells,
  featureFirst: tasksData.one_time.feature_first_shells,
} as const;

export const TARGETS = {
  weeklyConsistencyDays: tasksData.weekly.consistency.target_days,
  dailySetChallenges: tasksData.weekly.consistency.daily_set_challenges,
  weeklyVolumeBets: tasksData.weekly.volume.target_bets,
} as const;

export const TOUR_STEPS = tasksData.one_time.tour_steps;
export const FEATURE_FIRSTS = tasksData.one_time.feature_firsts;
export const TASKS_VERSION = tasksData.content_version;
export const DRAW_SIZE = tasksData.challenges.draw_size;

/** Today, as the UTC date string every draw and claim keys on. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Monday of the current UTC ISO week — the weekly window's start. */
export function utcWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/**
 * Deterministic per-date randomness: sha256(date:salt:counter) → uint32.
 * Every Lambda, every invocation, every deploy (same pool) agrees.
 */
function seededUint32(date: string, counter: number): number {
  const digest = createHash('sha256').update(`${date}:oddssea-daily-draw:${counter}`).digest();
  return digest.readUInt32BE(0);
}

/**
 * The day's challenge slate: filter the pool to entries available on
 * `date`, seeded-shuffle, then take up to DRAW_SIZE honoring the spec's
 * "at most one outcome-based task active at a time" (tasks.md rule 2).
 *
 * Because the shuffle sees only the FILTERED array, adding future-dated
 * entries to the pool cannot change any date's draw before they activate
 * — the filtered input, and therefore every seeded swap, is identical.
 * (Exported over an explicit pool so the harness can prove that.)
 */
export function drawFromPool(date: string, pool: readonly PoolEntry[]): PoolEntry[] {
  const shuffled = pool.filter((p) => p.availableFrom <= date);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = seededUint32(date, i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const draw: PoolEntry[] = [];
  let outcomeTaken = false;
  for (const entry of shuffled) {
    if (draw.length >= DRAW_SIZE) break;
    if (entry.kind === 'outcome') {
      if (outcomeTaken) continue;
      outcomeTaken = true;
    }
    draw.push(entry);
  }
  return draw;
}

export function dailyDraw(date: string): PoolEntry[] {
  return drawFromPool(date, POOL);
}

// ---------------------------------------------------- validate at module load
//
// A malformed task file must fail the deploy's first invocation loudly —
// the catalogue precedent. The pool must be drawable today AND tomorrow,
// so an all-future-dated pool (a bad available_from) cannot ship an empty
// slate at midnight.

function assertTasks(condition: boolean, message: string): void {
  if (!condition) throw new Error(`tasks validation failed: ${message}`);
}

(function validate() {
  for (const [name, amount] of Object.entries(AMOUNTS)) {
    assertTasks(amount > 0, `amount ${name} must be positive`);
  }
  for (const [name, target] of Object.entries(TARGETS)) {
    assertTasks(target > 0, `target ${name} must be positive`);
  }
  assertTasks(DRAW_SIZE >= 1, 'draw_size must be at least 1');
  assertTasks(POOL.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.availableFrom)), 'available_from must be YYYY-MM-DD');
  assertTasks(new Set(POOL.map((p) => p.key)).size === POOL.length, 'pool keys must be unique');
  assertTasks(POOL.every((p) => p.key.startsWith('challenge:')), 'pool keys must be challenge:*');

  const today = utcToday();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assertTasks(dailyDraw(today).length >= 1, 'the pool draws empty for today');
  assertTasks(dailyDraw(tomorrow).length >= 1, 'the pool draws empty for tomorrow');
  assertTasks(TOUR_STEPS.length === 4, 'tour must be exactly the four shipped steps');
  assertTasks(TOUR_STEPS[2].key === 'tour:equip', 'the equip step sits third, per the spec order');
  assertTasks(FEATURE_FIRSTS.length === 1 && FEATURE_FIRSTS[0].key === 'first_equip',
    'feature firsts must be exactly the shipped first_equip');
})();
