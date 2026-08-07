import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { call, ApiError } from './api-client';

/**
 * The closet, barebones (decisions/0022): six slots as text rows, two
 * selects each, an Equip button. No avatar rendering — that is the art
 * phase; this milestone is the MECHANICS of wearing.
 *
 * Two things worth noticing here. The selects submit ITEM INSTANCE ids
 * (items.id), not catalogue ids — two copies of the same garment are
 * different rows, and the loadout names which copy you wear. And the
 * equip call carries NO idempotency key: overwriting a loadout slot is
 * naturally idempotent and moves no money, so the economic-retry
 * machinery has nothing to protect.
 */

interface OwnedItem {
  itemId: string;
  catalogueId: string;
  name: string;
  kind: string;
  tier: string;
  slot: string;
  state: string;
}

interface EquippedRef {
  itemId: string;
  name: string;
  tier: string;
}

interface Collection {
  items: OwnedItem[];
  equipment: Record<string, { gear: EquippedRef | null; skin: EquippedRef | null }>;
}

const SLOTS = ['headgear', 'shirt', 'pants', 'shoes', 'backpack', 'held'] as const;

export function ClosetPanel() {
  const { config, me } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [picks, setPicks] = useState<Record<string, { gear: string; skin: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const result = await call<Collection>(config, '/collection', {
        onWaking: () => setWaking(true),
      });
      setCollection(result);
      setPicks(
        Object.fromEntries(
          SLOTS.map((slot) => [
            slot,
            {
              gear: result.equipment?.[slot]?.gear?.itemId ?? '',
              skin: result.equipment?.[slot]?.skin?.itemId ?? '',
            },
          ]),
        ),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setWaking(false);
    }
  }, [config]);

  useEffect(() => {
    void load();
    const onChanged = () => void load();
    window.addEventListener('oddssea:collection-changed', onChanged);
    return () => window.removeEventListener('oddssea:collection-changed', onChanged);
  }, [load]);

  if (!config || !me) return null;

  async function equip(slot: string) {
    setBusy(slot);
    setMessage(null);
    try {
      await call(config!, '/closet/equip', {
        method: 'POST',
        body: {
          slot,
          gearItemId: picks[slot]?.gear || null,
          skinItemId: picks[slot]?.skin || null,
        },
        onWaking: () => setWaking(true),
      });
      // Equipment changed — every panel that shows the collection or the
      // tour's equip step refreshes off this one event (we reload via our
      // own listener, same as everyone else).
      window.dispatchEvent(new CustomEvent('oddssea:collection-changed'));
      window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
    } catch (e) {
      if (e instanceof ApiError) setMessage(e.detail ?? e.message);
      else setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setWaking(false);
    }
  }

  if (!collection) {
    return (
      <section className="panel">
        <h2>Closet</h2>
        <p className="muted">{waking ? 'Waking the database…' : 'Loading the closet…'}</p>
        {message && <p className="error-text">{message}</p>}
      </section>
    );
  }

  const ownedFor = (slot: string, kind: string) =>
    collection.items.filter((i) => i.slot === slot && i.kind === kind && i.state === 'owned');

  return (
    <section className="panel">
      <h2>Closet</h2>
      <p className="muted">
        Wear what you own: per slot, a garment and a skin (any skin fits any
        garment via the mask channel). Text only until the art phase — the
        mechanics are the milestone.
      </p>
      <ul className="muted">
        {SLOTS.map((slot) => {
          const eq = collection.equipment?.[slot];
          return (
            <li key={slot}>
              <strong>{slot}</strong>: {eq?.gear ? eq.gear.name : '—'}
              {eq?.skin ? ` in ${eq.skin.name}` : ''}
              <div className="actions">
                <select
                  value={picks[slot]?.gear ?? ''}
                  onChange={(e) =>
                    setPicks((p) => ({ ...p, [slot]: { ...p[slot], gear: e.target.value } }))
                  }
                >
                  <option value="">(no gear)</option>
                  {ownedFor(slot, 'gear').map((i) => (
                    <option key={i.itemId} value={i.itemId}>
                      {i.name} ({i.tier})
                    </option>
                  ))}
                </select>
                <select
                  value={picks[slot]?.skin ?? ''}
                  onChange={(e) =>
                    setPicks((p) => ({ ...p, [slot]: { ...p[slot], skin: e.target.value } }))
                  }
                >
                  <option value="">(no skin)</option>
                  {ownedFor(slot, 'skin').map((i) => (
                    <option key={i.itemId} value={i.itemId}>
                      {i.name} ({i.tier})
                    </option>
                  ))}
                </select>
                <button onClick={() => equip(slot)} disabled={busy !== null}>
                  {busy === slot ? 'Equipping…' : 'Equip'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {waking && <p className="muted">Waking the database — retrying automatically…</p>}
      {message && <p className="error-text">{message}</p>}
    </section>
  );
}
