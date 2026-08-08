/**
 * Roulette as arithmetic (decisions/0029).
 *
 * Same doctrine as crash (decisions/0028): rounds derived from the
 * clock, the outcome derived from the retained round secret, nothing
 * stored that can be computed. Two things are specific to roulette and
 * pinned here:
 *
 *   THE POCKET IS EXACTLY UNIFORM. A naked `mod 37` over the 48-bit
 *   HMAC space carries modulo bias (some pockets would be one grid
 *   step likelier). Deterministic rejection removes it: accept the
 *   draw only below the largest multiple of 37, else re-hash with an
 *   attempt suffix. P(any rejection) ~ 5e-15 — effectively never, but
 *   the published 1/37 becomes exact rather than approximate.
 *
 *   THE LAYOUT IS DERIVED, NEVER TYPED IN. Splits, streets, corners
 *   and six-lines fall out of the 3x12 grid arithmetic (plus zero's
 *   specials). The wheel's COLORING is the one true lookup constant —
 *   red is a historical fact about roulette, not a derivable one.
 *
 * One secret, many games, disjoint messages: crash hashes the bare
 * index string; roulette hashes 'roulette:' + index. Domain separation
 * keeps the two games' outcome streams independent under one key.
 */

import { createHmac } from 'node:crypto';
import { ROULETTE } from './games';

export type RouletteBetType =
  | 'straight' | 'split' | 'street' | 'corner' | 'six_line'
  | 'dozen' | 'column'
  | 'red' | 'black' | 'odd' | 'even' | 'high' | 'low';

/** Selection-carrying types: the client says WHERE the chip sits. */
export const NUMBER_TYPES: readonly RouletteBetType[] = [
  'straight', 'split', 'street', 'corner', 'six_line', 'dozen', 'column',
];

/** Fixed types: the selection is implied by the name. */
export const FIXED_TYPES: readonly RouletteBetType[] = [
  'red', 'black', 'odd', 'even', 'high', 'low',
];

/** The one true lookup constant — the wheel's coloring. */
export const RED_NUMBERS: readonly number[] = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

const sorted = (ns: number[]) => [...ns].sort((a, b) => a - b);
const keyOf = (ns: number[]) => sorted(ns).join(',');

/**
 * The derived registry: every legal selection per type, canonical
 * (sorted ascending). Grid: number n (1..36) sits at row
 * floor((n-1)/3), column (n-1)%3 — three columns, twelve rows, zero
 * apart at the top.
 */
function buildRegistry(): Map<RouletteBetType, Map<string, number[]>> {
  const registry = new Map<RouletteBetType, Map<string, number[]>>();
  const add = (type: RouletteBetType, ns: number[]) => {
    const m = registry.get(type) ?? new Map<string, number[]>();
    m.set(keyOf(ns), sorted(ns));
    registry.set(type, m);
  };

  for (let n = 0; n <= 36; n += 1) add('straight', [n]);

  // Splits: horizontal (same row, adjacent columns), vertical (same
  // column, adjacent rows), and zero's three.
  for (let n = 1; n <= 36; n += 1) {
    if (n % 3 !== 0) add('split', [n, n + 1]);
    if (n <= 33) add('split', [n, n + 3]);
  }
  add('split', [0, 1]); add('split', [0, 2]); add('split', [0, 3]);

  // Streets: the twelve rows, plus zero's trios.
  for (let r = 0; r < 12; r += 1) add('street', [3 * r + 1, 3 * r + 2, 3 * r + 3]);
  add('street', [0, 1, 2]); add('street', [0, 2, 3]);

  // Corners: 2x2 squares (top-left n with n%3 != 0, not the last row),
  // plus the first-four.
  for (let n = 1; n <= 32; n += 1) {
    if (n % 3 !== 0) add('corner', [n, n + 1, n + 3, n + 4]);
  }
  add('corner', [0, 1, 2, 3]);

  // Six-lines: two adjacent rows.
  for (let r = 0; r < 11; r += 1) {
    add('six_line', [3 * r + 1, 3 * r + 2, 3 * r + 3, 3 * r + 4, 3 * r + 5, 3 * r + 6]);
  }

  for (let d = 0; d < 3; d += 1) {
    add('dozen', Array.from({ length: 12 }, (_, i) => d * 12 + i + 1));
  }
  for (let c = 1; c <= 3; c += 1) {
    add('column', Array.from({ length: 12 }, (_, i) => c + 3 * i));
  }

  const all = Array.from({ length: 36 }, (_, i) => i + 1);
  add('red', [...RED_NUMBERS]);
  add('black', all.filter((n) => !RED_NUMBERS.includes(n)));
  add('odd', all.filter((n) => n % 2 === 1));
  add('even', all.filter((n) => n % 2 === 0));
  add('low', all.filter((n) => n <= 18));
  add('high', all.filter((n) => n >= 19));

  return registry;
}

export const REGISTRY = buildRegistry();

/** The canonical legal selection, or null. Fixed types ignore the
 * caller's selection entirely — the name IS the selection. */
export function canonicalSelection(type: RouletteBetType, selection?: number[]): number[] | null {
  const m = REGISTRY.get(type);
  if (!m) return null;
  if ((FIXED_TYPES as readonly string[]).includes(type)) {
    return [...m.values()][0] ?? null;
  }
  if (!selection) return null;
  return m.get(keyOf(selection)) ?? null;
}

/** 40-second rounds — roulette's own clock helpers (crash's are bound
 * to its minute via CRASH params). */
export function rouletteRound(epochSeconds: number): number {
  return Math.floor(epochSeconds / ROULETTE.periodSeconds);
}
export function rouletteElapsed(epochSeconds: number): number {
  return epochSeconds % ROULETTE.periodSeconds;
}

/** The pocket for a round: domain-separated HMAC + deterministic
 * rejection. THE PUBLISHED ALGORITHM IS THE DEFINITION. */
export function roulettePocket(secret: string, index: number): number {
  const limit = 37 * Math.floor(2 ** 48 / 37);
  for (let attempt = 0; ; attempt += 1) {
    const message = attempt === 0 ? `roulette:${index}` : `roulette:${index}:${attempt}`;
    const h = createHmac('sha256', secret).update(message).digest().readUIntBE(0, 6);
    if (h < limit) return h % 37;
  }
}
