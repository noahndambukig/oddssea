/**
 * The games catalogue — plinko's published tables and the instant-game
 * parameters, from the shipping copy (docs/01-game/data/games.json;
 * currency-model.md is the doc of record).
 *
 * The RTP in the file is REDUNDANT ON PURPOSE: it is the published
 * number the UI shows, and this module recomputes it from rows +
 * multipliers at load, failing the deploy's first invocation on any
 * mismatch. A published number needs a tripwire against its own
 * derivation — a fat-fingered multiplier must be undeployable, not
 * quietly mispriced. (Rule: odds are never mispriced on purpose,
 * game-modes.md rule 3 — this makes "on purpose" checkable.)
 */

import gamesData from '../../docs/01-game/data/games.json';

export type PlinkoRisk = 'low' | 'mid' | 'high';
export const PLINKO_RISKS: readonly PlinkoRisk[] = ['low', 'mid', 'high'];

export interface PlinkoProfile {
  rows: number;
  multipliers: number[];
  rtp: number;
}

export const PLINKO_PROFILES: Record<PlinkoRisk, PlinkoProfile> = {
  low: gamesData.plinko.profiles.low,
  mid: gamesData.plinko.profiles.mid,
  high: gamesData.plinko.profiles.high,
};

export const INSTANT = {
  edge: gamesData.instant.edge,
  minStakeShells: gamesData.instant.min_stake_shells,
} as const;

export const CRASH = {
  periodSeconds: gamesData.crash.period_seconds,
  bettingSeconds: gamesData.crash.betting_seconds,
  doubleEverySeconds: gamesData.crash.double_every_seconds,
  minCashout: gamesData.crash.min_cashout,
  maxMultiplier: gamesData.crash.max_multiplier,
} as const;

export const ROULETTE = {
  periodSeconds: gamesData.roulette.period_seconds,
  bettingSeconds: gamesData.roulette.betting_seconds,
  payouts: gamesData.roulette.payouts as Record<string, number>,
  // DERIVED, not restated: the edge is what the payout identity leaves
  // on the table — 1 − 36/37 = 1/37 exactly (currency-model.md is the
  // doc of record). Writing 0.027027… anywhere would be a rounded
  // restatement of a number that has an exact closed form.
  edge: 1 - 36 / 37,
} as const;

/** Coverage per bet type — the identity's other half; validated
 * against the payout table at load. */
export const ROULETTE_COVERAGE: Record<string, number> = {
  straight: 1, split: 2, street: 3, corner: 4, six_line: 6,
  dozen: 12, column: 12, red: 18, black: 18, odd: 18, even: 18, high: 18, low: 18,
};

export const GAMES_VERSION = gamesData.content_version;

/** C(n,k) — exact for the row counts in play. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i += 1) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/** Closed-form RTP: Σ C(rows,k)/2^rows × m_k. No Monte Carlo needed. */
export function plinkoRtp(profile: PlinkoProfile): number {
  let sum = 0;
  for (let k = 0; k <= profile.rows; k += 1) {
    sum += choose(profile.rows, k) * profile.multipliers[k];
  }
  return sum / 2 ** profile.rows;
}

// ---------------------------------------------------- validate at module load

function assertGames(condition: boolean, message: string): void {
  if (!condition) throw new Error(`games validation failed: ${message}`);
}

(function validate() {
  assertGames(INSTANT.edge > 0 && INSTANT.edge < 0.1, 'instant edge out of range');
  assertGames(INSTANT.minStakeShells > 0, 'min stake must be positive');

  for (const risk of PLINKO_RISKS) {
    const p = PLINKO_PROFILES[risk];
    assertGames(p.rows >= 4 && p.rows <= 30, `${risk}: rows out of range`);
    assertGames(p.multipliers.length === p.rows + 1, `${risk}: table must have rows+1 entries`);
    for (let k = 0; k <= p.rows; k += 1) {
      assertGames(p.multipliers[k] >= 0, `${risk}: negative multiplier`);
      assertGames(
        p.multipliers[k] === p.multipliers[p.rows - k],
        `${risk}: table must be symmetric (index ${k})`,
      );
    }
    const computed = plinkoRtp(p);
    // The tripwires: the published number must BE the table's RTP, and the
    // table must price at the instant edge (player-favorable rounding
    // allowed, mispricing not).
    assertGames(
      Math.abs(computed - p.rtp) < 1e-12,
      `${risk}: published rtp ${p.rtp} != computed ${computed}`,
    );
    assertGames(
      computed >= 0.969 && computed <= 0.972,
      `${risk}: RTP ${computed} outside the 3%-edge band`,
    );
  }

  // Crash geometry (decisions/0028). The bust law itself is two constants
  // (edge, cap) — what can silently break is the round's SHAPE: the cap
  // must be reachable inside the minute or a top-end bust never resolves
  // on the curve players watch.
  const capTime =
    CRASH.bettingSeconds + CRASH.doubleEverySeconds * Math.log2(CRASH.maxMultiplier);
  assertGames(
    capTime < CRASH.periodSeconds - 5,
    `crash: cap ${CRASH.maxMultiplier}x reached at ${capTime}s — must clear the ` +
      `${CRASH.periodSeconds}s round with 5s margin`,
  );
  assertGames(CRASH.minCashout > 1, 'crash: min cashout must exceed 1.00 (a 1.00x cashout is a free round-trip)');
  assertGames(
    Math.round(CRASH.minCashout * 100) === CRASH.minCashout * 100,
    'crash: min cashout must sit on the cent grid',
  );
  assertGames(CRASH.bettingSeconds > 0 && CRASH.bettingSeconds < CRASH.periodSeconds, 'crash: betting window must fit the round');
  assertGames(CRASH.maxMultiplier > CRASH.minCashout, 'crash: cap below the minimum target');

  // Roulette (decisions/0029): the whole table is one identity —
  // payout × coverage = 36 for every type. A published number that
  // breaks the identity is a mispriced bet and fails the deploy.
  assertGames(
    Object.keys(ROULETTE.payouts).length === Object.keys(ROULETTE_COVERAGE).length,
    'roulette: payout table and coverage table must name the same types',
  );
  for (const [type, coverage] of Object.entries(ROULETTE_COVERAGE)) {
    const payout = ROULETTE.payouts[type];
    assertGames(payout !== undefined, `roulette: ${type} missing from the payout table`);
    assertGames(
      payout * coverage === 36,
      `roulette: ${type} breaks the identity — ${payout} × ${coverage} ≠ 36`,
    );
  }
  assertGames(
    ROULETTE.bettingSeconds > 0 && ROULETTE.bettingSeconds < ROULETTE.periodSeconds,
    'roulette: betting window must fit the round',
  );
})();
