import { useState } from 'react';
import { useAuth, type Me } from './AuthContext';
import { call } from '../api-client';

/**
 * The 18+ gate — blocking, once, before anything else renders.
 *
 * What the ledger changed: this writes to POSTGRES now, via POST /me/attest,
 * not to a Cognito custom attribute. Two consequences worth understanding:
 *
 *   THE GATE IS NO LONGER THE ENFORCEMENT. Every economic route checks
 *   players.age_attested_at server-side and rejects an unattested player. A
 *   client that skips this screen now skips nothing — which is what
 *   compliance.md actually asks for, and what a rendered gate alone never
 *   provided.
 *
 *   NO TOKEN REFRESH IS NEEDED AFTERWARDS. The old flow wrote a custom
 *   attribute and then had to force a fresh ID token to see it, because
 *   claims are baked in when a token is minted. A database row has no such
 *   problem: the next read simply reads.
 */
export function AttestationGate() {
  const { config, applyMe, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      await call<{ attestedAt: string }>(config, '/me/attest', { method: 'POST' });
      applyMe(await call<Me>(config, '/me'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <h1>oddssea</h1>
      <section className="panel">
        <h2>Before you enter</h2>
        <p>
          oddssea is a <strong>gambling simulator</strong>. Nothing here is real
          money and nothing can be cashed out — but the games are games of
          chance, and this site is intended for adults.
        </p>
        <label className="attest">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>I confirm that I am 18 years of age or older</span>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button onClick={submit} disabled={!checked || busy}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
