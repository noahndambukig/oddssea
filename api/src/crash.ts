/**
 * Crash rounds as arithmetic (decisions/0028).
 *
 * There is no scheduler and no round row: a round IS its UTC minute, and
 * every fact about it — betting window, curve, bust — is a pure function
 * of the clock and a server secret. Nothing runs while nobody plays;
 * any request can compute any round on demand.
 *
 * THE PUBLISHED ALGORITHM IS THE DEFINITION, floats included. An audit
 * recomputes a stored bust by running this exact recipe — determinism is
 * the property, exact rationals are not. Changing any line below changes
 * every future round's outcome, which is why the recipe is published in
 * the disclosure and currency-model.md rather than being an
 * implementation detail.
 */

import { createHmac } from 'node:crypto';
import { CRASH, INSTANT } from './games';

/** Floor to the cent grid — the quantisation the whole pricing law
 * assumes. `floor2(x) >= m` iff `x >= m` when m is on the grid, which is
 * exactly why every 2-decimal target keeps the published RTP. */
export function floor2(x: number): number {
  return Math.floor(x * 100) / 100;
}

/** The round is the UTC minute. */
export function roundIndex(epochMs: number): number {
  return Math.floor(epochMs / 1000 / CRASH.periodSeconds);
}

/** Seconds into the round's minute. */
export function roundElapsed(epochMs: number): number {
  return (epochMs / 1000) % CRASH.periodSeconds;
}

/** Clock-only phase. "Over" is not derivable from the clock alone — it
 * needs the bust — so the handler overlays it where the bust is known. */
export function roundPhase(epochMs: number): 'betting' | 'flight' {
  return roundElapsed(epochMs) < CRASH.bettingSeconds ? 'betting' : 'flight';
}

/** The public curve: 1.00x at flight start, doubling every 4 s, on the
 * cent grid, clamped at the cap. Defined (as 1.00) during betting too so
 * callers need no phase guard. */
export function multiplierAt(elapsedSeconds: number): number {
  const t = elapsedSeconds - CRASH.bettingSeconds;
  if (t <= 0) return 1;
  return Math.min(CRASH.maxMultiplier, floor2(2 ** (t / CRASH.doubleEverySeconds)));
}

/** When the bust becomes public history: the second of the minute at
 * which the curve reaches it. Before this moment the bust never crosses
 * the wire; after it, revealing it leaks nothing. */
export function tBustSeconds(bust: number): number {
  return CRASH.bettingSeconds + CRASH.doubleEverySeconds * Math.log2(bust);
}

/**
 * The bust for a round: HMAC-SHA256(secret, round index) -> first 48
 * bits -> U in (0, 1] -> the inverse-CDF law P(B >= m) = (1-edge)/m,
 * floored to cents and clamped to [1.00, cap].
 *
 * 48 bits because 2^48 fits in a double exactly (readUIntBE caps at 6
 * bytes for the same reason). The +1 keeps U strictly positive — U = 0
 * would divide by zero, and the law wants (0, 1].
 */
export function crashBust(secret: string, index: number): number {
  const h = createHmac('sha256', secret).update(String(index)).digest();
  const u = (h.readUIntBE(0, 6) + 1) / 2 ** 48;
  const raw = (1 - INSTANT.edge) / u;
  return Math.min(CRASH.maxMultiplier, Math.max(1, floor2(raw)));
}
