import { useEffect, useRef, useState } from 'react';
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

  const [crashStake, setCrashStake] = useState(10);
  const [crashTarget, setCrashTarget] = useState('');
  const [crashView, setCrashView] = useState<CrashRoundView | null>(null);
  const [lastCrash, setLastCrash] = useState<CrashOutcome | null>(null);
  const [, setCrashTick] = useState(0);
  // The server's clock is the round's clock: the offset learned from
  // every poll corrects this browser's, so the window countdown and the
  // curve animation line up with what SQL will actually rule.
  const crashOffset = useRef(0);
  const crashBusy = useRef(false);
  const crashSettling = useRef(false);
  const meRef = useRef(me);
  meRef.current = me;

  /**
   * The flight poll (decisions/0028): the client animates the public
   * curve locally between polls, but the BUST is server-revealed — it
   * never crosses the wire before its moment has passed, so the only
   * way to see the round die is to keep asking. The same response
   * carries other players' cashouts (the feed) and whether any of my
   * bets await settlement; settlement itself is an explicit POST, never
   * a side effect of the read.
   */
  useEffect(() => {
    if (!config) return;
    let alive = true;
    let beat = 0;

    const poll = async () => {
      if (!meRef.current || crashBusy.current) return;
      crashBusy.current = true;
      try {
        const view = await call<CrashRoundView>(config, '/crash/round');
        if (!alive) return;
        crashOffset.current = view.serverEpochMs - Date.now();
        setCrashView(view);

        if (view.pendingSettlement && !crashSettling.current) {
          crashSettling.current = true;
          try {
            const settled = await call<CrashSettleResult>(config, '/bets/crash/settle', {
              method: 'POST',
            });
            if (alive && meRef.current) {
              applyMe({ ...meRef.current, shells: settled.shells, pearls: settled.pearls });
              if (settled.recent.length > 0) setLastCrash(settled.recent[0]);
              window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
            }
          } finally {
            crashSettling.current = false;
          }
        }
      } catch {
        // Background poll: errors surface on the next player action.
      } finally {
        crashBusy.current = false;
      }
    };

    const interval = setInterval(() => {
      if (!alive) return;
      setCrashTick((t) => t + 1);
      beat += 1;
      if (beat % 4 === 0) void poll();
    }, 250);
    void poll();

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [config, applyMe]);

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

  async function rideCrash() {
    const key = newIdempotencyKey();
    const target = crashTarget.trim() === '' ? undefined : Number(crashTarget);
    const result = await run('crash-bet', () =>
      call<CrashPlaceResult>(config!, '/bets/crash', {
        method: 'POST',
        idempotencyKey: key,
        body: { stake: crashStake, ...(target !== undefined ? { autoTarget: target } : {}) },
        onWaking: () => setWaking(true),
      }),
    );
    if (result) {
      applyMe({ ...me!, shells: result.shells, pearls: result.pearls });
      window.dispatchEvent(new CustomEvent('oddssea:tasks-changed'));
    }
  }

  async function cashOutCrash(betId: string) {
    const key = newIdempotencyKey();
    const result = await run('crash-cashout', () =>
      call<CrashOutcome & { shells: number; pearls: number }>(config!, '/bets/crash/cashout', {
        method: 'POST',
        idempotencyKey: key,
        body: { betId },
        onWaking: () => setWaking(true),
      }),
    );
    if (result) {
      applyMe({ ...me!, shells: result.shells, pearls: result.pearls });
      setLastCrash(result);
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

      {(() => {
        // Everything below derives from the server-corrected clock; the
        // poll overlays the facts only the server may reveal (the bust,
        // the feed, my open bet).
        const crash = gamesData.crash;
        const cNow = Date.now() + crashOffset.current;
        const cIdx = Math.floor(cNow / 1000 / crash.period_seconds);
        const cElapsed = (cNow / 1000) % crash.period_seconds;
        const viewIsCurrent = crashView !== null && crashView.round.index === cIdx;
        const busted = viewIsCurrent && crashView!.round.bust !== undefined;
        const cPhase: 'betting' | 'flight' | 'over' =
          cElapsed < crash.betting_seconds ? 'betting' : busted ? 'over' : 'flight';
        const cMult =
          cElapsed <= crash.betting_seconds
            ? 1
            : Math.min(
                crash.max_multiplier,
                Math.floor(2 ** ((cElapsed - crash.betting_seconds) / crash.double_every_seconds) * 100) / 100,
              );
        const myBet = viewIsCurrent ? crashView!.myOpenBet : null;

        return (
          <section className="panel">
            <h2>Crash</h2>
            <p className="muted">
              One shared round per minute: bet in the first {crash.betting_seconds} seconds,
              then the curve climbs from 1.00× until it busts. Cash out before the bust —
              live, or with an auto-cashout target — to lock stake × multiplier. Everyone
              rides the same curve.
            </p>

            {cPhase === 'betting' && (
              <>
                <p>
                  Round <code>{cIdx}</code> — betting closes in{' '}
                  <code>{Math.max(0, crash.betting_seconds - cElapsed).toFixed(0)}s</code>
                </p>
                {myBet ? (
                  <p className="muted">
                    Riding this round: <code>{myBet.stake}</code> Shells
                    {myBet.autoTarget !== null && <> · auto-cashout ×<code>{myBet.autoTarget}</code></>}
                  </p>
                ) : (
                  <div className="actions">
                    <label className="attest">
                      <span>Stake</span>
                      <input
                        type="number"
                        min={gamesData.instant.min_stake_shells}
                        step={10}
                        value={crashStake}
                        onChange={(e) => setCrashStake(Number(e.target.value))}
                      />
                    </label>
                    <label className="attest">
                      <span>Auto-cashout × (optional)</span>
                      <input
                        type="number"
                        min={crash.min_cashout}
                        max={crash.max_multiplier}
                        step={0.01}
                        placeholder="none"
                        value={crashTarget}
                        onChange={(e) => setCrashTarget(e.target.value)}
                      />
                    </label>
                    <button onClick={rideCrash} disabled={busy !== null}>
                      {busy === 'crash-bet' ? 'Placing…' : 'Bet'}
                    </button>
                  </div>
                )}
              </>
            )}

            {cPhase === 'flight' && (
              <>
                <p>
                  <strong>×{cMult.toFixed(2)}</strong> and climbing…
                </p>
                {myBet && (
                  <div className="actions">
                    <button onClick={() => cashOutCrash(myBet.betId)} disabled={busy !== null}>
                      {busy === 'crash-cashout'
                        ? 'Cashing out…'
                        : `Cash out @ ×${cMult.toFixed(2)}`}
                    </button>
                  </div>
                )}
                {viewIsCurrent && crashView!.round.cashouts.length > 0 && (
                  <p className="muted">
                    Bailed this round:{' '}
                    {crashView!.round.cashouts.map((m, i) => (
                      <span key={i}>
                        <code>×{m}</code>{' '}
                      </span>
                    ))}
                  </p>
                )}
              </>
            )}

            {cPhase === 'over' && (
              <p>
                Busted at <strong>×{crashView!.round.bust}</strong> — next round in{' '}
                <code>{Math.max(0, crash.period_seconds - cElapsed).toFixed(0)}s</code>
              </p>
            )}

            {lastCrash && (
              <div className="result">
                <p className="muted">
                  Last ride: {lastCrash.won ? 'cashed out at' : 'lost —'}{' '}
                  {lastCrash.won && <code>×{lastCrash.multiplier}</code>}
                  {!lastCrash.won && <>bust <code>×{lastCrash.bust}</code></>}. Payout{' '}
                  <code>{lastCrash.payout}</code> Shells, <code>{lastCrash.pearlsAwarded}</code>{' '}
                  Pearls.
                </p>
              </div>
            )}

            {crashView && (
              <p className="muted">
                Last round busted at <code>×{crashView.lastRound.bust}</code>
                {crashView.lastRound.cashouts.length > 0 && (
                  <>
                    {' '}— cashouts:{' '}
                    {crashView.lastRound.cashouts.map((m, i) => (
                      <span key={i}>
                        <code>×{m}</code>{' '}
                      </span>
                    ))}
                  </>
                )}
              </p>
            )}

            <details>
              <summary>
                Published odds — RTP {((1 - gamesData.instant.edge) * 100).toFixed(2)}% at
                every cash-out target (house edge{' '}
                {(gamesData.instant.edge * 100).toFixed(0)}%)
              </summary>
              <p className="muted">
                The bust law: P(bust ≥ m) = {(1 - gamesData.instant.edge).toFixed(2)}/m for
                every cent target from ×{crash.min_cashout} to ×
                {crash.max_multiplier.toLocaleString()}, so every target returns exactly{' '}
                {((1 - gamesData.instant.edge) * 100).toFixed(2)}% of stake in expectation —
                ties pay. Payouts floor to whole Shells, so the effective Shell return sits
                at or below that figure and converges to it at larger stakes. Each round's
                bust is derived before the round runs: U from the first 48 bits of
                HMAC-SHA256(server secret, round number), bust = clamp(1.00,
                floor₂({(1 - gamesData.instant.edge).toFixed(2)}/U), {crash.max_multiplier.toLocaleString()}) — every
                past bust is recomputable from the recipe.
              </p>
            </details>
          </section>
        );
      })()}

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

interface CrashRoundView {
  serverEpochMs: number;
  round: {
    index: number;
    phase: 'betting' | 'flight' | 'over';
    bust?: number;
    secondsLeftInWindow: number;
    secondsToNextRound: number;
    cashouts: number[];
  };
  myOpenBet: { betId: string; stake: number; autoTarget: number | null } | null;
  pendingSettlement: boolean;
  lastRound: { index: number; bust: number; cashouts: number[] };
}

interface CrashOutcome {
  betId: string;
  roundIndex?: number;
  autoTarget?: number | null;
  bust: number;
  multiplier: number | null;
  won: boolean;
  stake: number;
  payout: number;
  pearlsAwarded: number;
}

interface CrashSettleResult {
  recent: CrashOutcome[];
  skipped: number[];
  shells: number;
  pearls: number;
  pearlsPending: number;
}

interface CrashPlaceResult {
  betId: string;
  roundIndex: number;
  autoTarget: number | null;
  stake: number;
  skipped: number[];
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
