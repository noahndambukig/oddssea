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
 * The catch this panel exists to teach: when the gateway's JWT authorizer
 * REJECTS a request, its 401/403 carries no CORS headers — API Gateway only
 * adds them to responses from an integration, and a rejected request never
 * reached one. The browser therefore hides the response entirely and fetch
 * rejects with a TypeError. So a signed-out /me click renders the block
 * itself as the result; the numeric status lives in the curl checks, where
 * CORS does not exist.
 */

interface CallResult {
  route: string;
  sentToken: boolean;
  ms: number;
  status?: number;
  body?: unknown;
  corsBlocked?: boolean;
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
      // fetch rejecting here (TypeError) means the browser blocked the
      // response — for this API, that is the authorizer rejection wearing
      // its CORS disguise.
      const ms = Math.round(performance.now() - started);
      setResult({ route, sentToken, ms, corsBlocked: true });
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
          {result.corsBlocked ? (
            <>
              <p className="error-text">
                <code>{result.route}</code> — blocked by CORS after{' '}
                {result.ms} ms.
              </p>
              <p className="muted">
                The gateway rejected this before any Lambda ran (the Lambda
                log shows nothing). Rejections never reach the integration,
                so they carry no CORS headers and the browser hides the
                status. Run the curl check to see the number — 401 without a
                token, 403 with an ID token.
              </p>
            </>
          ) : (
            <>
              <p className="muted">
                <code>{result.route}</code>
                {result.sentToken ? ' with Bearer access token' : ' — no token sent'}
                {' → '}
                <code>{result.status}</code> in {result.ms} ms
              </p>
              <pre>{JSON.stringify(result.body, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
