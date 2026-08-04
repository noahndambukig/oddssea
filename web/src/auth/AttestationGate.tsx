import { useState } from 'react';
import { useAuth } from './AuthContext';
import { forceRefresh, getAccessToken } from './auth-client';
import { writeAttestedAt } from './user-api';

/**
 * The 18+ attestation gate — docs/06-risks/compliance.md requires this
 * "from day one on the web", and docs/decisions/0017 records the interim
 * storage (a Cognito custom attribute, migrating to the players table when
 * the database exists).
 *
 * Renders INSTEAD of the app for any authenticated, un-attested user.
 * On confirm: write the timestamp, then FORCE a token refresh — the stored
 * ID token was minted before the write and never gains the claim on its
 * own, so without the refresh a page reload within the hour would reopen
 * this gate for a user who already passed it.
 */
export function AttestationGate() {
  const { config, markAttested, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getAccessToken(config);
      if (!accessToken) throw new Error('Session expired — sign in again.');
      const now = new Date().toISOString();
      await writeAttestedAt(config, accessToken, now);
      // Mint tokens that carry the new claim; the invariant in
      // auth-client.ts keeps the refresh token itself intact.
      await forceRefresh(config);
      markAttested(now);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header>
        <h1>oddssea</h1>
      </header>
      <section className="panel">
        <h2>Before you enter</h2>
        <p>
          oddssea is a <strong>gambling simulator</strong>. Nothing here is
          real money and nothing can be cashed out — but the games are games
          of chance, and this site is intended for adults.
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
          <button disabled={!checked || busy} onClick={() => void confirm()}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
          <button className="secondary" disabled={busy} onClick={logout}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
