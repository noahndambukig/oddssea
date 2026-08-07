/**
 * The random half of a crate open. Everything here is CSPRNG draws over the
 * catalogue; nothing here reads state or decides outcomes.
 *
 * The split (and why): pity counters and first-four distinctness live in the
 * database and must be read under the player row lock — but the ledger
 * rule is ONE Data API call per economic event, so the lock cannot span
 * calls. Node therefore pre-rolls every random draw this open could need —
 * the tier roll, one candidate per tier, the set permutation — and SQL
 * applies the rules to them under the lock. The whole payload is stored
 * verbatim on crate_opens, so the audit trail carries every draw, including
 * the ones a pity override left unused: that is what lets an auditor
 * distinguish luck from mercy.
 *
 * randomInt is crypto-grade (decisions/0015 — the dice precedent), and the
 * shuffle is Fisher-Yates: an Array.sort(() => random) shuffle is BIASED,
 * and bias in a disclosed-odds system is a compliance defect.
 */

import { randomInt } from 'node:crypto';
import {
  CRATE_TABLES,
  PITY,
  Tier,
  TIERS,
  completionMeta,
  cratePools,
  setDefinition,
  type CompletionMeta,
  type CrateKind,
} from './catalogue';

/**
 * The tier roll space. Rates are multiplied into it as exact decimals
 * (0.67 → 670,000), so the mapping in SQL is integer comparison against
 * cumulative thresholds — no floating point at the decision site.
 */
export const TIER_ROLL_MAX = 1_000_000;

export interface CandidatesPayload {
  /** Gear/skin crates: one pre-picked catalogue id per tier. */
  picks?: Record<Tier, string>;
  /** Set crates: the five non-keystone piece ids, uniformly shuffled. */
  permutation?: string[];
  /** Set crates: the keystone id (a legendary result, pity or luck). */
  keystone?: string;
  /** Per candidate id: its dex page and set, for completion checks in SQL. */
  meta: Record<string, CompletionMeta>;
}

/** Everything open_crate() needs for one open, pre-rolled. */
export interface OpenSpec {
  kind: CrateKind;
  targetSet: string | null;
  tierRoll: number;
  rollMax: number;
  rates: Record<Tier, number>;
  pricePearls: number;
  candidates: CandidatesPayload;
  /** Legendary/keystone pity threshold for this open's scope. */
  pityThreshold: number;
  /** Epic-or-better drought threshold; basic crates only. */
  droughtThreshold: number | null;
}

function pickUniform(pool: readonly string[]): string {
  return pool[randomInt(pool.length)];
}

/** Fisher-Yates, crypto-backed. Uniform over all n! permutations. */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function metaFor(ids: string[]): Record<string, CompletionMeta> {
  return Object.fromEntries(ids.map((id) => [id, completionMeta(id)]));
}

/**
 * Pre-roll one open. For gear/skin crates the candidates are one uniform
 * pick per tier — only the effective tier's pick is used, but all four are
 * recorded. For set crates the candidates are a shuffled permutation of the
 * five pieces plus the keystone; SQL walks the permutation under the
 * first-four rule, so uniformity of the permutation is what makes the
 * eventual pick uniform.
 */
export function buildOpen(kind: CrateKind, targetSet?: string): OpenSpec {
  const table = CRATE_TABLES[kind];
  const base = {
    tierRoll: randomInt(1, TIER_ROLL_MAX + 1),
    rollMax: TIER_ROLL_MAX,
    rates: table.rates,
    pricePearls: table.pricePearls,
  };

  if (kind === 'set') {
    if (!targetSet) throw new Error('set crate requires a target set');
    const set = setDefinition(targetSet);
    const permutation = shuffle(set.pieceIds);
    return {
      kind,
      targetSet,
      ...base,
      candidates: {
        permutation,
        keystone: set.keystoneId,
        meta: metaFor([...permutation, set.keystoneId]),
      },
      pityThreshold: PITY.setKeystone,
      droughtThreshold: null,
    };
  }

  const pools = cratePools(kind);
  const picks = Object.fromEntries(TIERS.map((tier) => [tier, pickUniform(pools[tier])])) as Record<
    Tier,
    string
  >;
  const basic = kind === 'basic_gear' || kind === 'basic_skin';
  return {
    kind,
    targetSet: null,
    ...base,
    candidates: { picks, meta: metaFor(Object.values(picks)) },
    pityThreshold: basic ? PITY.basicLegendary : PITY.premiumLegendary,
    droughtThreshold: basic ? PITY.epicOrBetter : null,
  };
}
