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
})();
