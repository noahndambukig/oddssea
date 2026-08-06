import { useState } from 'react';
import { useAuth, type Me } from './auth/AuthContext';
import { call, newIdempotencyKey, ApiError } from './api-client';

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

  if (!config || !me) return null;

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
          <button onClick={claim} disabled={busy !== null}>
            {busy === 'claim' ? 'Claiming…' : 'Claim daily login'}
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

export type { Me };
