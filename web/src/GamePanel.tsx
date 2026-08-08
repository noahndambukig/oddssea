import { useState } from 'react';
import { useAuth, type Me } from './auth/AuthContext';
import { call, newIdempotencyKey, ApiError } from './api-client';
// Content-as-code's third consumer (docs, api, web): the SAME shipping
// copy the server prices against renders the disclosure here — the
// multiplier tables and exact RTPs cannot diverge between what the UI
// promises and what SQL pays (game-modes.md rule 1).
import gamesData from '../../docs/01-game/data/games.json';

/**
 * The first real economy: a balance, a faucet, and a sink.
 *
 * The idempotency discipline is the part worth reading. A key is generated
 * ONCE per user action and reused across every retry of that action —
 * including the automatic retries the api client performs while the database
 * wakes. Generating a fresh key per attempt would make every retry a new
 * economic event, which is exactly the double-charge the mechanism exists to
 * prevent.
 *
 * Both calls return the new balances in their response, so there is no
 * follow-up GET: the function that moved the money is the function that
 * reports the result, computed inside the same transaction.
 */
export function GamePanel() {
  const { config, me, applyMe } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<DiceResult | null>(null);

  const [stake, setStake] = useState(10);
  const [threshold, setThreshold] = useState(50);
  const [direction, setDirection] = useState<'over' | 'under'>('under');

  const [plinkoRisk, setPlinkoRisk] = useState<'low' | 'mid' | 'high'>('low');
  const [plinkoStake, setPlinkoStake] = useState(10);
  const [lastDrop, setLastDrop] = useState<PlinkoResult | null>(null);

  if (!config || !me) return null;

  /**
   * Already claimed today? The server is the authority — it refuses a second
   * claim regardless of what this button does — but offering an action that
   * cannot succeed is a bad interface. Days are UTC everywhere in this
   * system (data-model.md rule 6), so the comparison must be too: using the
   * browser's local date would disable the button at the wrong moment for
   * anyone west of Greenwich.
   */
  const todayUtc = new Date().toISOString().slice(0, 10);
  const claimedToday = me.lastClaimDate === todayUtc;

  async function run<T>(label: string, work: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setMessage(null);
    try {
      return await work();
    } catch (e) {
      if (e instanceof ApiError) {
        // Rule violations come back with the database's own message —
        // "already claimed today", "insufficient shells". They are outcomes,
        // not failures.
        setMessage(e.detail ?? e.message);
      } else {
        setMessage(e instanceof Error ? e.message : String(e));
      }
      return null;
    } finally {
      setBusy(null);
      setWaking(false);
    }
  }

  async function claim() {
    // One key for this click, reused by every retry inside call().
    const key = newIdempotencyKey();
    const result = await run('claim', () =>
      call<ClaimResult>(config!, '/tasks/login-claim', {
        method: 'POST',
        idempotencyKey: key,
        onWaking: () => setWaking(true),
      }),
    );
    if (result) {
      applyMe({
        ...me!,
        shells: result.shells,
        pearls: result.pearls,
        streak: result.streak,
        lastClaimDate: result.claimDate,
      });
      setMessage(`Claimed ${result.claimed} Shells — day ${result.streak} of the streak.`);
      // The login claim is part of the daily set — the tasks panel's
      // consistency progress depends on it.
      window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
    }
  }

  async function bet() {
    const key = newIdempotencyKey();
    const result = await run('bet', () =>
      call<DiceResult>(config!, '/bets/dice', {
        method: 'POST',
        idempotencyKey: key,
        body: { stake, direction, threshold },
        onWaking: () => setWaking(true),
      }),
    );
    if (result) {
      applyMe({ ...me!, shells: result.shells, pearls: result.pearls });
      setLastRoll(result);
      // Bets change task PROGRESS (first-bet, place-N, win-a-bet, weekly
      // volume), not the collection — hence the second event: overloading
      // collection-changed would refetch the whole collection per roll.
      window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
    }
  }

  async function drop() {
    const key = newIdempotencyKey();
    const result = await run('plinko', () =>
      call<PlinkoResult>(config!, '/bets/plinko', {
        method: 'POST',
        idempotencyKey: key,
        body: { stake: plinkoStake, risk: plinkoRisk },
        onWaking: () => setWaking(true),
      }),
    );
    if (result) {
      applyMe({ ...me!, shells: result.shells, pearls: result.pearls });
      setLastDrop(result);
      window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Your balance</h2>
        <dl className="facts">
          <dt>Shells</dt>
          <dd>
            <code>{me.shells.toLocaleString()}</code>
          </dd>
          <dt>Pearls</dt>
          <dd>
            <code>{me.pearls.toLocaleString()}</code>
          </dd>
          <dt>Login streak</dt>
          <dd>
            <code>{me.streak} day{me.streak === 1 ? '' : 's'}</code>
          </dd>
        </dl>
        <p className="muted">
          Shells come only from tasks; Pearls come only from wagering. Every
          movement above is an append-only ledger row — the balances are a
          cached summary the server re-checks on every write.
        </p>
        <div className="actions">
          <button onClick={claim} disabled={busy !== null || claimedToday}>
            {busy === 'claim'
              ? 'Claiming…'
              : claimedToday
                ? 'Claimed today — back tomorrow'
                : 'Claim daily login'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Dice</h2>
        <p className="muted">
          Roll 1–100. Win if the roll is {direction} {threshold}. The payout is
          derived from that probability at the house edge — form is never
          mispriced, the edge is the only adjustment.
        </p>
        <div className="actions">
          <label className="attest">
            <span>Stake</span>
            <input
              type="number"
              min={10}
              step={10}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
            />
          </label>
          <label className="attest">
            <span>Threshold</span>
            <input
              type="number"
              min={2}
              max={99}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <button
            className="secondary"
            onClick={() => setDirection(direction === 'under' ? 'over' : 'under')}
          >
            {direction}
          </button>
          <button onClick={bet} disabled={busy !== null}>
            {busy === 'bet' ? 'Rolling…' : 'Roll'}
          </button>
        </div>

        {lastRoll && (
          <div className="result">
            <p className="muted">
              Rolled <code>{lastRoll.roll}</code> — {lastRoll.won ? 'won' : 'lost'} at odds{' '}
              <code>{lastRoll.odds}</code>. Payout <code>{lastRoll.payout}</code> Shells,{' '}
              <code>{lastRoll.pearlsAwarded}</code> Pearls
              {lastRoll.pearlsPending > 0 && (
                <> (plus <code>{lastRoll.pearlsPending}</code> carried toward the next whole Pearl)</>
              )}
              .
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Plinko</h2>
        <p className="muted">
          Pick a risk, pick a stake, drop. The ball bounces once per row —
          a fair coin each time — and the bucket pays its published
          multiplier. Every number below is the one the server pays
          against.
        </p>
        <div className="actions">
          <label className="attest">
            <span>Risk</span>
            <select
              value={plinkoRisk}
              onChange={(e) => setPlinkoRisk(e.target.value as 'low' | 'mid' | 'high')}
            >
              {(['low', 'mid', 'high'] as const).map((r) => (
                <option key={r} value={r}>
                  {r} ({gamesData.plinko.profiles[r].rows} rows, max ×
                  {Math.max(...gamesData.plinko.profiles[r].multipliers)})
                </option>
              ))}
            </select>
          </label>
          <label className="attest">
            <span>Stake</span>
            <input
              type="number"
              min={gamesData.instant.min_stake_shells}
              step={10}
              value={plinkoStake}
              onChange={(e) => setPlinkoStake(Number(e.target.value))}
            />
          </label>
          <button onClick={drop} disabled={busy !== null}>
            {busy === 'plinko' ? 'Dropping…' : 'Drop'}
          </button>
        </div>

        {lastDrop && (
          <div className="result">
            <p className="muted">
              Bucket <code>{lastDrop.bucket}</code> of{' '}
              <code>{lastDrop.rows}</code> — ×<code>{lastDrop.multiplier}</code>
              {lastDrop.won ? ' (win)' : ''}. Payout <code>{lastDrop.payout}</code> Shells,{' '}
              <code>{lastDrop.pearlsAwarded}</code> Pearls
              {lastDrop.pearlsPending > 0 && (
                <> (plus <code>{lastDrop.pearlsPending}</code> carried)</>
              )}
              .
            </p>
          </div>
        )}

        <details>
          <summary>
            Published odds — {plinkoRisk}: RTP{' '}
            {(gamesData.plinko.profiles[plinkoRisk].rtp * 100).toFixed(4)}% (house edge{' '}
            {(gamesData.instant.edge * 100).toFixed(0)}% nominal)
          </summary>
          <ul className="muted">
            {gamesData.plinko.profiles[plinkoRisk].multipliers.map((m, k) => (
              <li key={k}>
                bucket {k}: ×{m} — {(bucketProbability(gamesData.plinko.profiles[plinkoRisk].rows, k) * 100).toFixed(3)}%
              </li>
            ))}
          </ul>
        </details>
      </section>

      {waking && (
        <p className="muted">
          Waking the database — it pauses when nobody is playing, which is why
          this costs almost nothing to run. Retrying automatically…
        </p>
      )}
      {message && <p className="error-text">{message}</p>}
    </>
  );
}

interface ClaimResult {
  claimed: number;
  streak: number;
  claimDate: string;
  shells: number;
  pearls: number;
}

interface DiceResult {
  won: boolean;
  roll: number;
  odds: number;
  payout: number;
  pearlsAwarded: number;
  pearlsPending: number;
  shells: number;
  pearls: number;
}

interface PlinkoResult {
  won: boolean;
  rows: number;
  bucket: number;
  multiplier: number;
  payout: number;
  pearlsAwarded: number;
  pearlsPending: number;
  shells: number;
  pearls: number;
}

/** C(rows,k)/2^rows — a derivation from the published table's shape, not a
 * restated number. */
function bucketProbability(rows: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i += 1) c = (c * (rows - i)) / (i + 1);
  return Math.round(c) / 2 ** rows;
}

export type { Me };
