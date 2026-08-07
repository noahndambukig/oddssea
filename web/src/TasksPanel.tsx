import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { call, newIdempotencyKey, ApiError } from './api-client';

/**
 * The faucet, barebones (decisions/0022): three lists and claim buttons.
 *
 * Progress numbers here are ADVISORY — the server derives them again, under
 * the player lock, when a claim actually happens. The panel proposes; the
 * database disposes.
 *
 * The one subtle interaction is tour step 2, a COMPOUND action: it may
 * first claim the starter crates (one economic call) and then claim the
 * tour step (another). Two calls, two idempotency keys — the key space is
 * global per player, so a shared key would replay the first call's stored
 * response as the second call's answer. And "starter crates already
 * claimed" from call 1 is treated as success: it usually means an earlier
 * attempt committed and only the response was lost.
 */

interface TaskRow {
  key: string;
  name: string;
  amount: number;
  target?: number;
  progress?: number;
  claimed: boolean;
  claimable?: boolean;
}

interface Slate {
  date: string;
  weekStart: string;
  starterClaimed: boolean;
  daily: TaskRow[];
  weekly: TaskRow[];
  oneTime: TaskRow[];
}

interface ClaimResult {
  taskKey: string;
  claimed: number;
  shells: number;
  pearls: number;
}

export function TasksPanel() {
  const { config, me, applyMe } = useAuth();
  const [slate, setSlate] = useState<Slate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const result = await call<Slate>(config, '/tasks', { onWaking: () => setWaking(true) });
      setSlate(result);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setWaking(false);
    }
  }, [config]);

  useEffect(() => {
    void load();
    // Two producers matter to the slate: collection changes (starter
    // crates, equips — tour claimables) and task-progress changes (bets,
    // the login claim). Listen to both.
    const onChanged = () => void load();
    window.addEventListener('oddssea:collection-changed', onChanged);
    window.addEventListener('oddssea:tasks-changed', onChanged);
    return () => {
      window.removeEventListener('oddssea:collection-changed', onChanged);
      window.removeEventListener('oddssea:tasks-changed', onChanged);
    };
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

  async function claimOnly(taskKey: string) {
    const key = newIdempotencyKey();
    const result = await call<ClaimResult>(config!, '/tasks/claim', {
      method: 'POST',
      idempotencyKey: key,
      body: { taskKey },
      onWaking: () => setWaking(true),
    });
    applyMe({ ...me!, shells: result.shells, pearls: result.pearls });
    setMessage(`Claimed ${result.claimed} Shells — ${taskKey}`);
  }

  async function claim(taskKey: string) {
    await run(taskKey, async () => {
      if (taskKey === 'tour:starter-crates' && slate && !slate.starterClaimed) {
        // Compound: open the starter crates first — its OWN key. An
        // "already claimed" rejection means an earlier attempt committed;
        // proceed rather than strand.
        try {
          const starter = await call<{ shells: number; pearls: number }>(
            config!,
            '/crates/starter',
            {
              method: 'POST',
              idempotencyKey: newIdempotencyKey(),
              onWaking: () => setWaking(true),
            },
          );
          applyMe({ ...me!, shells: starter.shells, pearls: starter.pearls });
        } catch (e) {
          if (!(e instanceof ApiError && /already claimed/i.test(e.detail ?? ''))) throw e;
        }
        window.dispatchEvent(new CustomEvent('oddssea:collection-changed'));
      }
      await claimOnly(taskKey);
      await load();
    });
  }

  if (!slate) {
    return (
      <section className="panel">
        <h2>Tasks</h2>
        <p className="muted">{waking ? 'Waking the database…' : 'Loading tasks…'}</p>
        {message && <p className="error-text">{message}</p>}
      </section>
    );
  }

  const row = (t: TaskRow) => (
    <li key={t.key}>
      {t.name} — <strong>{t.amount} Shells</strong>
      {t.target !== undefined && t.target > 1 && (
        <>
          {' '}
          · <code>{t.progress ?? 0}/{t.target}</code>
        </>
      )}
      {t.claimed ? (
        <> · claimed ✓</>
      ) : (
        <>
          {' '}
          <button
            onClick={() => claim(t.key)}
            disabled={busy !== null || t.claimable === false}
          >
            {busy === t.key ? 'Claiming…' : 'Claim'}
          </button>
        </>
      )}
    </li>
  );

  return (
    <section className="panel">
      <h2>Tasks</h2>
      <p className="muted">
        Shells come only from tasks — this is the faucet. Progress shown here
        is a courtesy; the server recounts everything when you claim.
      </p>

      <h3>Today ({slate.date})</h3>
      <ul className="muted">{slate.daily.map(row)}</ul>

      <h3>This week (from {slate.weekStart})</h3>
      <ul className="muted">{slate.weekly.map(row)}</ul>

      <h3>One-time</h3>
      <ul className="muted">{slate.oneTime.map(row)}</ul>

      {waking && (
        <p className="muted">
          Waking the database — it pauses when nobody is playing. Retrying
          automatically…
        </p>
      )}
      {message && <p className="error-text">{message}</p>}
    </section>
  );
}
