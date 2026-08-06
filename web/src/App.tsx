import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { AttestationGate } from './auth/AttestationGate';
import { GamePanel } from './GamePanel';

export default function App() {
  const { status, config, error, profile, me, login, logout } = useAuth();
  const [showClaims, setShowClaims] = useState(false);

  if (status === 'loading') {
    return (
      <main className="shell">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  /**
   * A first-class state, not an error. The database pauses when idle — the
   * reason this project costs almost nothing — so a cold start genuinely
   * takes 15–30 seconds. Saying so is better than a spinner that looks
   * broken, and it teaches the trade rather than hiding it.
   */
  if (status === 'waking') {
    return (
      <main className="shell">
        <h1>oddssea</h1>
        <section className="panel">
          <h2>Waking the database…</h2>
          <p className="muted">
            oddssea pauses its database when nobody is playing. Starting it
            again takes about fifteen seconds — longer if it has been asleep a
            while. Retrying automatically.
          </p>
        </section>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="shell">
        <h1>oddssea</h1>
        <div className="panel error">
          <h2>Something went wrong</h2>
          <pre>{error}</pre>
        </div>
      </main>
    );
  }

  // Authenticated but not attested → nothing else renders. The server
  // enforces this too; the gate is the courtesy, not the control.
  if (status === 'authenticated' && me && !me.attestedAt) {
    return <AttestationGate />;
  }

  return (
    <main className="shell">
      <header>
        <h1>oddssea</h1>
        <p className="muted">
          The ledger — real balances, one faucet, one game
          {config?.environment ? ` · ${config.environment}` : ''}
        </p>
      </header>

      {status === 'anonymous' ? (
        <section className="panel">
          <h2>You are not signed in</h2>
          <p className="muted">
            Signing in leaves this page entirely: the server runs the OAuth
            exchange and sets a cookie your JavaScript cannot read. Check{' '}
            <code>document.cookie</code> afterwards — it stays empty.
          </p>
          <div className="actions">
            <button onClick={() => login()}>Sign in</button>
            <button className="secondary" onClick={() => login({ signUp: true })}>
              Create an account
            </button>
          </div>
        </section>
      ) : (
        <>
          <GamePanel />

          <section className="panel">
            <h2>Session</h2>
            <dl className="facts">
              <dt>User ID (sub)</dt>
              <dd>
                <code>{me?.sub ?? '—'}</code>
              </dd>
              <dt>18+ attested</dt>
              <dd>
                <code>{me?.attestedAt ?? '—'}</code>
              </dd>
              <dt>Last claim</dt>
              <dd>
                <code>{me?.lastClaimDate ?? 'never'}</code>
              </dd>
            </dl>
            <div className="actions">
              <button className="secondary" onClick={() => setShowClaims((v) => !v)}>
                {showClaims ? 'Hide' : 'Show'} raw ID-token claims
              </button>
              <button className="secondary" onClick={logout}>
                Sign out
              </button>
            </div>
            {showClaims && (
              <div className="result">
                <p className="muted">
                  The ID token is held in memory only and never written to
                  storage. The refresh token is in an httpOnly cookie this
                  code cannot reach at all.
                </p>
                <pre>{JSON.stringify(profile, null, 2)}</pre>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
