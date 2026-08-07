/**
 * The cosmetics catalogue, derived from the content JSONs at module load.
 *
 * The JSONs under docs/03-cosmetics/content/data/ are the SHIPPING COPIES
 * (doc-conventions rule 6): the same files the specs and simulations read.
 * esbuild inlines JSON imports at bundle time, so this Lambda carries the
 * catalogue inside its own bundle — no S3 fetch, no cold-start read, and a
 * content change is a deploy, which is exactly what versioned content wants.
 *
 * Nothing in here is random and nothing touches the database. This module
 * answers one question: WHAT exists — items, tiers, pools, pages, sets,
 * prices, rates. crates.ts decides what a given open offers; SQL decides
 * what a given open produces.
 *
 * Every derivation is validated at the bottom and a failure THROWS AT
 * MODULE LOAD. A bad catalogue should fail the deploy's first invocation
 * loudly, not mint wrong items quietly.
 */

import dropTablesData from '../../docs/03-cosmetics/content/data/drop-tables.json';
import gearData from '../../docs/03-cosmetics/content/data/gear.json';
import skinsData from '../../docs/03-cosmetics/content/data/skins.json';
import setsData from '../../docs/03-cosmetics/content/data/sets.json';

export type Tier = 'common' | 'rare' | 'epic' | 'legendary';
export const TIERS: readonly Tier[] = ['common', 'rare', 'epic', 'legendary'];

export type Slot = 'headgear' | 'shirt' | 'pants' | 'shoes' | 'backpack' | 'held';
export const SLOTS: readonly Slot[] = ['headgear', 'shirt', 'pants', 'shoes', 'backpack', 'held'];

export type CrateKind = 'basic_gear' | 'basic_skin' | 'premium_gear' | 'premium_skin' | 'set';
export const CRATE_KINDS: readonly CrateKind[] = [
  'basic_gear',
  'basic_skin',
  'premium_gear',
  'premium_skin',
  'set',
];

export interface CatalogueItem {
  id: string;
  name: string;
  kind: 'gear' | 'skin';
  tier: Tier;
  family: string;
  /** The avatar slot the item occupies. A keystone occupies its set's keystone_slot. */
  slot: Slot;
  isKeystone: boolean;
}

export interface DexPage {
  /** Stable key, also used in one_time_claims as `dex_page:<key>`. */
  key: string;
  title: string;
  memberIds: string[];
}

export interface SetDefinition {
  id: string;
  family: string;
  name: string;
  keystoneId: string;
  /** The five non-keystone piece ids. */
  pieceIds: string[];
  /** All six: pieces + keystone. */
  memberIds: string[];
}

// ---------------------------------------------------------------- gear items

const gearItems: CatalogueItem[] = gearData.families.flatMap((family) =>
  SLOTS.map((slot) => {
    const entry = (family.items as Record<Slot, { id: string; name: string }>)[slot];
    return {
      id: entry.id,
      name: entry.name,
      kind: 'gear' as const,
      tier: family.tier as Tier,
      family: family.id,
      slot,
      isKeystone: false,
    };
  }),
);

// ---------------------------------------------------------------- skin items
//
// skins.json defines each family ONCE (the treatment applies to every slot
// via the mask channel), so the per-slot ownable items are derived here:
// skin.<family>.<slot>, tier = family tier.
//
// For the three set families the keystone REPLACES the keystone_slot piece:
// skin.<family>.keystone exists, skin.<family>.<keystone_slot> does not.
// Keystones are always Legendary regardless of the family's tier — that, and
// dropping only from Set Crates, is what keeps "the keystone is the wall".

const setByFamily = new Map(setsData.sets.map((s) => [s.family, s]));

const skinItems: CatalogueItem[] = skinsData.families.flatMap((family) => {
  const set = setByFamily.get(family.id);
  const regular = SLOTS.filter((slot) => !(set && slot === set.keystone_slot)).map((slot) => ({
    id: `skin.${family.id}.${slot}`,
    name: `${family.name} (${slot})`,
    kind: 'skin' as const,
    tier: family.tier as Tier,
    family: family.id,
    slot,
    isKeystone: false,
  }));
  if (!set) return regular;
  return [
    ...regular,
    {
      id: set.keystone.id,
      name: set.keystone.name,
      kind: 'skin' as const,
      tier: 'legendary' as const,
      family: family.id,
      slot: set.keystone_slot as Slot,
      isKeystone: true,
    },
  ];
});

export const ITEMS: readonly CatalogueItem[] = [...gearItems, ...skinItems];

const byId = new Map(ITEMS.map((item) => [item.id, item]));

export function itemById(id: string): CatalogueItem {
  const item = byId.get(id);
  if (!item) throw new Error(`unknown catalogue id: ${id}`);
  return item;
}

// --------------------------------------------------------------------- sets

export const SETS: readonly SetDefinition[] = setsData.sets.map((set) => {
  const pieces = skinItems.filter((i) => i.family === set.family && !i.isKeystone);
  return {
    id: set.id,
    family: set.family,
    name: skinsData.families.find((f) => f.id === set.family)?.name ?? set.family,
    keystoneId: set.keystone.id,
    pieceIds: pieces.map((p) => p.id),
    memberIds: [...pieces.map((p) => p.id), set.keystone.id],
  };
});

const setById = new Map(SETS.map((s) => [s.id, s]));

export function setDefinition(setId: string): SetDefinition {
  const set = setById.get(setId);
  if (!set) throw new Error(`unknown set: ${setId}`);
  return set;
}

// --------------------------------------------------------------- crate pools
//
// What a tier roll can produce, per crate kind. Basic and premium share
// pools — they differ in RATES, not in what exists (crates.md).
//
//   gear crates   all 66 garments, by tier (legendary = the cosmic family)
//   skin crates   the 63 non-keystone skins, by tier (legendary = Void
//                 Weave's six — keystones NEVER appear here)
//   set crates    handled as a permutation of the target set, not a pool

function poolByTier(items: CatalogueItem[]): Record<Tier, string[]> {
  const pools: Record<Tier, string[]> = { common: [], rare: [], epic: [], legendary: [] };
  for (const item of items) pools[item.tier].push(item.id);
  return pools;
}

const GEAR_POOLS = poolByTier(gearItems);
const SKIN_POOLS = poolByTier(skinItems.filter((i) => !i.isKeystone));

export function cratePools(kind: Exclude<CrateKind, 'set'>): Record<Tier, string[]> {
  return kind === 'basic_gear' || kind === 'premium_gear' ? GEAR_POOLS : SKIN_POOLS;
}

// ---------------------------------------------------------------- dex pages
//
// dex.md: Gear Dex is six pages, one per SLOT (11 entries each); Skin Dex is
// eleven pages, one per FAMILY (6 entries each — for set families that is
// five pieces plus the keystone). 132 entries total.

export const GEAR_PAGES: readonly DexPage[] = SLOTS.map((slot) => ({
  key: `gear:${slot}`,
  title: `Gear — ${slot}`,
  memberIds: gearItems.filter((i) => i.slot === slot).map((i) => i.id),
}));

export const SKIN_PAGES: readonly DexPage[] = skinsData.families.map((family) => ({
  key: `skin:${family.id}`,
  title: `Skins — ${family.name}`,
  memberIds: skinItems.filter((i) => i.family === family.id).map((i) => i.id),
}));

const pageByItemId = new Map<string, DexPage>();
for (const page of [...GEAR_PAGES, ...SKIN_PAGES]) {
  for (const id of page.memberIds) pageByItemId.set(id, page);
}

const setByItemId = new Map<string, SetDefinition>();
for (const set of SETS) {
  for (const id of set.memberIds) setByItemId.set(id, set);
}

/**
 * What completing on this item could pay: its dex page, and its set if it
 * belongs to one. Shipped inside the `candidates` payload so the SQL
 * function can check page/set completion under the player lock without the
 * database needing to know the catalogue.
 */
export interface CompletionMeta {
  page: string;
  pageMembers: string[];
  set?: string;
  setMembers?: string[];
}

export function completionMeta(catalogueId: string): CompletionMeta {
  const page = pageByItemId.get(catalogueId);
  if (!page) throw new Error(`no dex page contains ${catalogueId}`);
  const set = setByItemId.get(catalogueId);
  return {
    page: page.key,
    pageMembers: page.memberIds,
    ...(set ? { set: set.id, setMembers: set.memberIds } : {}),
  };
}

// -------------------------------------------------------------- drop tables

export interface CrateTable {
  pricePearls: number;
  rates: Record<Tier, number>;
}

export const CRATE_TABLES: Record<CrateKind, CrateTable> = Object.fromEntries(
  CRATE_KINDS.map((kind) => {
    const entry = dropTablesData.crates[kind];
    return [kind, { pricePearls: entry.price_pearls, rates: entry.rates as Record<Tier, number> }];
  }),
) as Record<CrateKind, CrateTable>;

export const PITY = {
  basicLegendary: dropTablesData.pity.basic_legendary.threshold,
  premiumLegendary: dropTablesData.pity.premium_legendary.threshold,
  setKeystone: dropTablesData.pity.set_keystone.threshold,
  epicOrBetter: dropTablesData.pity.epic_or_better.threshold,
} as const;

export const COMPLETION_BONUSES = {
  dexPageShells: dropTablesData.completion_bonuses.dex_page_shells,
  setShells: dropTablesData.completion_bonuses.set_shells,
} as const;

/** Version of the item catalogue (gear/skins/sets — validated identical). */
export const CATALOGUE_VERSION = gearData.content_version;
/** Version of the drop tables (prices, rates, pity, bonuses). */
export const DROP_TABLE_VERSION = dropTablesData.content_version;

/**
 * The starter grant's composition (currency-model.md's onboarding grant of
 * three Basic crates): 2 Basic Gear + 1 Basic Skin, which satisfies the
 * first-session guarantee — at least one garment and one skin — by
 * construction rather than by luck. The SQL function re-verifies this
 * composition, so a modified client cannot claim three of anything else.
 */
export const STARTER_COMPOSITION: readonly Exclude<CrateKind, 'set'>[] = [
  'basic_gear',
  'basic_gear',
  'basic_skin',
];

// ---------------------------------------------------- validate at module load
//
// This throws during cold start if the content and the code disagree —
// which fails the first invocation after a deploy, loudly, instead of
// letting a malformed catalogue mint items.

function assertCatalogue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`catalogue validation failed: ${message}`);
}

(function validate() {
  assertCatalogue(gearItems.length === 66, `expected 66 gear items, got ${gearItems.length}`);
  assertCatalogue(skinItems.length === 66, `expected 66 skin items, got ${skinItems.length}`);
  assertCatalogue(byId.size === 132, `expected 132 unique ids, got ${byId.size}`);

  for (const family of gearData.families) {
    const slots = Object.keys(family.items);
    assertCatalogue(
      slots.length === 6 && SLOTS.every((s) => slots.includes(s)),
      `gear family ${family.id} does not cover the six slots`,
    );
  }

  assertCatalogue(
    gearData.content_version === skinsData.content_version &&
      gearData.content_version === setsData.content_version,
    'gear/skins/sets content_version mismatch',
  );

  for (const set of setsData.sets) {
    assertCatalogue(
      skinsData.families.some((f) => f.id === set.family),
      `set family ${set.family} is not a skin family`,
    );
    assertCatalogue(
      set.keystone.id === `skin.${set.family}.keystone`,
      `keystone id ${set.keystone.id} does not follow skin.<family>.keystone`,
    );
    assertCatalogue(
      !setsData.excluded_from_sets.includes(set.family),
      `set family ${set.family} is also excluded_from_sets`,
    );
  }
  for (const set of SETS) {
    assertCatalogue(set.pieceIds.length === 5, `set ${set.id} has ${set.pieceIds.length} pieces`);
    assertCatalogue(set.memberIds.length === 6, `set ${set.id} is not six members`);
  }

  // The basic/premium skin legendary pool is exactly Void Weave's six plain
  // pieces — the wall: keystones are reachable only through Set Crates.
  assertCatalogue(
    SKIN_POOLS.legendary.length === 6 && SKIN_POOLS.legendary.every((id) => id.startsWith('skin.void-weave.')),
    'skin-crate legendary pool must be exactly the six Void Weave pieces',
  );
  assertCatalogue(
    [...SKIN_POOLS.common, ...SKIN_POOLS.rare, ...SKIN_POOLS.epic, ...SKIN_POOLS.legendary].every(
      (id) => !itemById(id).isKeystone,
    ),
    'a keystone leaked into a skin-crate pool',
  );

  for (const kind of ['basic_gear', 'basic_skin', 'premium_gear', 'premium_skin'] as const) {
    const pools = cratePools(kind);
    for (const tier of TIERS) {
      assertCatalogue(pools[tier].length > 0, `${kind} has an empty ${tier} pool`);
    }
  }

  for (const kind of CRATE_KINDS) {
    const table = CRATE_TABLES[kind];
    assertCatalogue(table.pricePearls > 0, `${kind} has no price`);
    const sum = TIERS.reduce((acc, tier) => acc + table.rates[tier], 0);
    assertCatalogue(Math.abs(sum - 1) < 1e-9, `${kind} rates sum to ${sum}, not 1`);
  }

  assertCatalogue(
    PITY.basicLegendary > 0 && PITY.premiumLegendary > 0 && PITY.setKeystone > 0 && PITY.epicOrBetter > 0,
    'pity thresholds must be positive',
  );
  assertCatalogue(
    COMPLETION_BONUSES.dexPageShells > 0 && COMPLETION_BONUSES.setShells > 0,
    'completion bonuses must be positive',
  );

  const totalDexEntries = [...GEAR_PAGES, ...SKIN_PAGES].reduce((n, p) => n + p.memberIds.length, 0);
  assertCatalogue(totalDexEntries === 132, `dex pages cover ${totalDexEntries} entries, not 132`);
  assertCatalogue(pageByItemId.size === 132, 'some item belongs to no dex page');
})();
