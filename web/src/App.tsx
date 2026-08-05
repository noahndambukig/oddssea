import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { AttestationGate } from './auth/AttestationGate';
import { loadTokens } from './auth/token-store';
import { ApiPanel } from './ApiPanel';

export default function App() {
  const { status, config, error, profile, attestedAt, login, logout } = useAuth();
  const [showClaims, setShowClaims] = useState(false);

  if (status === 'loading') {
    return (
      <main className="shell">
        <p className="muted">Loading…</p>
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

  // The compliance gate: authenticated but not attested → nothing else
  // renders. See auth/AttestationGate.tsx.
  if (status === 'authenticated' && !attestedAt) {
    return <AttestationGate />;
  }

  return (
    <main className="shell">
      <header>
        <h1>oddssea</h1>
        <p className="muted">
          Increment C — a token-guarded API
          {config?.environment ? ` · ${config.environment}` : ''}
        </p>
      </header>

      {status === 'anonymous' ? (
        <section className="panel">
          <h2>You are not signed in</h2>
          <p className="muted">
            Signing in sends you to the hosted login page, then back here with
            a one-time code this app exchanges for tokens. Open devtools →
            Network before clicking to watch it happen.
          </p>
          <div className="actions">
            <button onClick={() => login()}>Sign in</button>
            <button className="secondary" onClick={() => login({ signUp: true })}>
              Create an account
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>Signed in</h2>
          <dl className="facts">
            <dt>User ID (sub)</dt>
            <dd>
              <code>{String(profile?.sub ?? '—')}</code>
            </dd>
            <dt>Email</dt>
            <dd>
              <code>{String(profile?.email ?? '—')}</code>
            </dd>
            <dt>Email verified</dt>
            <dd>
              <code>{String(profile?.email_verified ?? '—')}</code>
            </dd>
            <dt>18+ attested</dt>
            <dd>
              <code>{attestedAt ?? '—'}</code>
            </dd>
            <dt>Session expires</dt>
            <dd>
              <code>
                {typeof profile?.exp === 'number'
                  ? new Date(profile.exp * 1000).toLocaleTimeString()
                  : '—'}
              </code>
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
                Everything Cognito put in your ID token — readable by anyone
                holding it, forgeable by no one. The signature is the security.
              </p>
              <pre>{JSON.stringify(profile, null, 2)}</pre>
              <p className="muted">
                Tokens in this tab's sessionStorage:{' '}
                <code>{loadTokens() ? 'access · id · refresh' : 'none'}</code>
              </p>
            </div>
          )}
        </section>
      )}

      {/* Both auth states, deliberately: signed out, the /me click dying at
          the gateway is a demonstration, not an error. */}
      <ApiPanel />
    </main>
  );
}
