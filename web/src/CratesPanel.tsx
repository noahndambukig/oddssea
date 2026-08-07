import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { call, newIdempotencyKey, ApiError } from './api-client';

/**
 * The Pearl sink, deliberately barebones (decisions/0022): buttons, text
 * lists, native <details> — no reveal ceremony until the art phase.
 *
 * Same idempotency discipline as GamePanel: one key per click, reused by
 * every retry inside call(). What is NEW here is that the server pre-rolls
 * all randomness and decides under a lock — so a retried open returns the
 * SAME item, not a re-roll. The pity counters shown below are a spec rule
 * (crates.md: disclosed odds, visible counters), not polish.
 */

interface DexEntry {
  id: string;
  name: string;
  tier: string;
  owned: boolean;
}

interface DexPage {
  key: string;
  title: string;
  total: number;
  owned: number;
  entries: DexEntry[];
}

interface PityCounter {
  scope: string;
  target: string;
  legendary_counter: number;
  epic_drought: number;
  total_opens: number;
}

interface Collection {
  starterClaimed: boolean;
  prices: Record<string, number>;
  pity: {
    counters: PityCounter[];
    thresholds: {
      basicLegendary: number;
      premiumLegendary: number;
      setKeystone: number;
      epicOrBetter: number;
    };
  };
  items: {
    catalogueId: string;
    name: string;
    kind: string;
    tier: string;
    slot: string;
    isKeystone: boolean;
    source: string;
    acquiredAt: string;
  }[];
  gearPages: DexPage[];
  skinPages: DexPage[];
  sets: { id: string; name: string; total: number; owned: number; keystoneOwned: boolean }[];
}

interface OpenResult {
  kind: string;
  targetSet: string | null;
  rolledTier: string;
  effectiveTier: string;
  pityFired: boolean;
  completions: { type: string; key: string; shells: number }[];
  item: { id: string; name: string; tier: string; slot: string; isKeystone: boolean };
}

const PAID_KINDS = [
  { kind: 'basic_gear', label: 'Basic Gear' },
  { kind: 'basic_skin', label: 'Basic Skin' },
  { kind: 'premium_gear', label: 'Premium Gear' },
  { kind: 'premium_skin', label: 'Premium Skin' },
] as const;

export function CratesPanel() {
  const { config, me, applyMe } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastOpens, setLastOpens] = useState<OpenResult[]>([]);
  const [targetSet, setTargetSet] = useState<string>('');

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const result = await call<Collection>(config, '/collection', {
        onWaking: () => setWaking(true),
      });
      setCollection(result);
      if (result.sets.length && !targetSet) setTargetSet(result.sets[0].id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setWaking(false);
    }
    // targetSet is deliberately not a dependency: it only seeds the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!config || !me) return null;

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError) {
        setMessage(e.detail ?? e.message);
      } else {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      setWaking(false);
    }
  }

  function absorb(opens: OpenResult[], shells: number, pearls: number) {
    applyMe({ ...me!, shells, pearls });
    setLastOpens(opens);
    void load();
  }

  async function claimStarter() {
    const key = newIdempotencyKey();
    await run('starter', async () => {
      const result = await call<{ opens: OpenResult[]; shells: number; pearls: number }>(
        config!,
        '/crates/starter',
        { method: 'POST', idempotencyKey: key, onWaking: () => setWaking(true) },
      );
      absorb(result.opens, result.shells, result.pearls);
    });
  }

  async function open(kind: string) {
    const key = newIdempotencyKey();
    await run(kind, async () => {
      const result = await call<{ open: OpenResult; shells: number; pearls: number }>(
        config!,
        '/crates/open',
        {
          method: 'POST',
          idempotencyKey: key,
          body: kind === 'set' ? { kind, targetSet } : { kind },
          onWaking: () => setWaking(true),
        },
      );
      absorb([result.open], result.shells, result.pearls);
    });
  }

  if (!collection) {
    return (
      <section className="panel">
        <h2>Crates</h2>
        <p className="muted">{waking ? 'Waking the database…' : 'Loading the collection…'}</p>
        {message && <p className="error-text">{message}</p>}
      </section>
    );
  }

  const { thresholds } = collection.pity;
  const counter = (scope: string, target = '') =>
    collection.pity.counters.find((c) => c.scope === scope && c.target === target);
  const basic = counter('basic');
  const premium = counter('premium');

  return (
    <>
      <section className="panel">
        <h2>Crates</h2>

        {!collection.starterClaimed ? (
          <>
            <p className="muted">
              Every account starts with three free crates — two Basic Gear and
              one Basic Skin, so your first opens always produce something you
              can wear together. Paid crates unlock after you claim them: the
              server refuses paid opens first, it does not just hide buttons.
            </p>
            <div className="actions">
              <button onClick={claimStarter} disabled={busy !== null}>
                {busy === 'starter' ? 'Opening…' : 'Claim your 3 starter crates'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="actions">
              {PAID_KINDS.map(({ kind, label }) => (
                <button key={kind} onClick={() => open(kind)} disabled={busy !== null}>
                  {busy === kind ? 'Opening…' : `${label} — ${collection.prices[kind]} Pearls`}
                </button>
              ))}
            </div>
            <div className="actions">
              <label className="attest">
                <span>Set</span>
                <select value={targetSet} onChange={(e) => setTargetSet(e.target.value)}>
                  {collection.sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.owned}/{s.total}
                      {s.keystoneOwned ? ', keystone owned' : ''})
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => open('set')} disabled={busy !== null || !targetSet}>
                {busy === 'set' ? 'Opening…' : `Set Crate — ${collection.prices.set} Pearls`}
              </button>
            </div>
            <p className="muted">
              Pity — disclosed always, per the spec: basic Legendary in{' '}
              <code>{thresholds.basicLegendary - (basic?.legendary_counter ?? 0)}</code>, epic
              drought <code>{basic?.epic_drought ?? 0}</code>/
              <code>{thresholds.epicOrBetter}</code> · premium Legendary in{' '}
              <code>{thresholds.premiumLegendary - (premium?.legendary_counter ?? 0)}</code>
              {collection.sets.map((s) => {
                const c = counter('set_chase', s.id);
                return (
                  <span key={s.id}>
                    {' '}
                    · {s.name} keystone{' '}
                    {s.keystoneOwned ? (
                      'owned'
                    ) : (
                      <>
                        in <code>{thresholds.setKeystone - (c?.legendary_counter ?? 0)}</code>
                      </>
                    )}
                  </span>
                );
              })}
            </p>
          </>
        )}

        {lastOpens.length > 0 && (
          <div className="result">
            {lastOpens.map((o, i) => (
              <p key={i}>
                <strong>{o.effectiveTier}</strong> — {o.item.name} ({o.item.slot})
                {o.pityFired && (
                  <>
                    {' '}
                    · <em>pity fired (rolled {o.rolledTier})</em>
                  </>
                )}
                {o.completions.map((c) => (
                  <span key={c.key}>
                    {' '}
                    · <strong>+{c.shells} Shells</strong> — {c.type === 'set' ? 'set' : 'dex page'}{' '}
                    complete ({c.key})
                  </span>
                ))}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Collection</h2>
        <p className="muted">
          {collection.items.length} item{collection.items.length === 1 ? '' : 's'} owned ·{' '}
          {[...collection.gearPages, ...collection.skinPages].reduce((n, p) => n + p.owned, 0)} of
          132 dex entries
        </p>

        <details>
          <summary>Inventory ({collection.items.length})</summary>
          <ul className="muted">
            {collection.items.map((item, i) => (
              <li key={i}>
                {item.tier} · {item.name} — {item.kind}/{item.slot}
                {item.isKeystone ? ' · keystone' : ''} · via {item.source}
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary>
            Gear Dex (
            {collection.gearPages.reduce((n, p) => n + p.owned, 0)}/
            {collection.gearPages.reduce((n, p) => n + p.total, 0)})
          </summary>
          {collection.gearPages.map((page) => (
            <details key={page.key}>
              <summary>
                {page.title} ({page.owned}/{page.total})
                {page.owned === page.total ? ' ✓ complete' : ''}
              </summary>
              <ul className="muted">
                {page.entries.map((e) => (
                  <li key={e.id}>
                    {e.owned ? '✓' : '–'} {e.name} ({e.tier})
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>

        <details>
          <summary>
            Skin Dex (
            {collection.skinPages.reduce((n, p) => n + p.owned, 0)}/
            {collection.skinPages.reduce((n, p) => n + p.total, 0)})
          </summary>
          {collection.skinPages.map((page) => (
            <details key={page.key}>
              <summary>
                {page.title} ({page.owned}/{page.total})
                {page.owned === page.total ? ' ✓ complete' : ''}
              </summary>
              <ul className="muted">
                {page.entries.map((e) => (
                  <li key={e.id}>
                    {e.owned ? '✓' : '–'} {e.name} ({e.tier})
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>
      </section>

      {waking && (
        <p className="muted">
          Waking the database — it pauses when nobody is playing. Retrying
          automatically…
        </p>
      )}
      {message && <p className="error-text">{message}</p>}
    </>
  );
}
