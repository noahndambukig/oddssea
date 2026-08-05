import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { getAccessToken } from './auth/auth-client';

/**
 * Exercise the API from the page, in both auth states.
 *
 * /health carries no Authorization header, so it is a "simple" CORS request
 * — no preflight — and always answers 200: the API being up and your token
 * working are separately observable facts.
 *
 * /me sends the ACCESS token as a Bearer header when one exists. The
 * Authorization header is not CORS-safelisted, so the browser preflights
 * first (watch for the OPTIONS request in devtools — API Gateway answers it
 * itself; no Lambda runs).
 *
 * Rejections render normally. An HTTP API adds `access-control-allow-origin`
 * to its OWN authorizer-generated 401/403 as well as to integration
 * responses (verified against the deployed API — this is where HTTP APIs
 * differ from REST APIs, where gateway responses need CORS wired up by
 * hand). So a signed-out /me shows a real 401 here, and `fetch` only
 * rejects on a genuine network failure — which is what the catch below is
 * for.
 */

interface CallResult {
  route: string;
  sentToken: boolean;
  ms: number;
  status?: number;
  body?: unknown;
  networkError?: boolean;
}

export function ApiPanel() {
  const { config } = useAuth();
  const [result, setResult] = useState<CallResult | null>(null);
  const [busy, setBusy] = useState(false);

  if (!config) return null;

  async function call(route: '/health' | '/me') {
    if (!config) return;
    setBusy(true);

    const headers: Record<string, string> = {};
    let sentToken = false;
    if (route === '/me') {
      // Deliberately proceeds without a header when signed out — that call
      // dying at the gateway IS the demonstration.
      const token = await getAccessToken(config);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        sentToken = true;
      }
    }

    const started = performance.now();
    try {
      const response = await fetch(`${config.apiUrl}${route}`, { headers });
      const ms = Math.round(performance.now() - started);
      const body: unknown = await response.json().catch(() => null);
      setResult({ route, sentToken, ms, status: response.status, body });
    } catch {
      // fetch rejects only on a network-level failure — DNS, TLS, offline,
      // or a CORS block. An HTTP status, including 401 and 403, resolves.
      const ms = Math.round(performance.now() - started);
      setResult({ route, sentToken, ms, networkError: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>The API</h2>
      <p className="muted">
        Two routes on <code>{config.apiUrl.replace('https://', '')}</code>:
        one public, one that only a valid access token opens. The first call
        after a quiet spell is slower — that is a Lambda cold start.
      </p>
      <div className="actions">
        <button onClick={() => call('/health')} disabled={busy}>
          GET /health
        </button>
        <button onClick={() => call('/me')} disabled={busy}>
          GET /me
        </button>
      </div>
      {result && (
        <div className="result">
          {result.networkError ? (
            <p className="error-text">
              <code>{result.route}</code> — the request never completed
              ({result.ms} ms). Not an HTTP status: DNS, TLS, offline, or a
              CORS block. Check the console and the Network tab.
            </p>
          ) : (
            <>
              <p className="muted">
                <code>{result.route}</code>
                {result.sentToken ? ' with Bearer access token' : ' — no token sent'}
                {' → '}
                <code>{result.status}</code> in {result.ms} ms
              </p>
              <pre>{JSON.stringify(result.body, null, 2)}</pre>
              {result.status === 401 && (
                <p className="muted">
                  401 — the gateway does not know who you are. No Lambda ran:
                  the log group has no entry for this request. That absence
                  is the point of a gateway authorizer.
                </p>
              )}
              {result.status === 403 && (
                <p className="muted">
                  403, not 401 — this token is <em>valid</em>. Same issuer,
                  same signature, right audience. It fails only the{' '}
                  <code>openid</code> scope requirement, which is what keeps
                  an ID token out of a route that wants an access token.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
