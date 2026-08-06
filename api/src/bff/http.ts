/**
 * Response helpers for the BFF, and one constraint that shapes all of them.
 *
 * CLOUDFRONT'S ERROR RESPONSES ARE DISTRIBUTION-WIDE. The distribution maps
 * 403 and 404 to index.html with a 200 so the SPA can route client-side
 * (infra/lib/constructs/web.ts). An /auth/* behaviour on that same
 * distribution inherits it — there is no per-behaviour override.
 *
 * So a 403 or 404 from this code would reach the browser as an HTML page
 * with a success status. Every response below therefore uses only
 * 200, 302, 400, 401 or 503.
 */

export interface HttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
}

export function json(statusCode: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

export function redirect(location: string, cookies: string[] = []): HttpResponse {
  return { statusCode: 302, headers: { Location: location }, cookies };
}

/**
 * The 503 an API route returns while the cluster wakes.
 *
 * `Retry-After` is NOT a CORS-safelisted response header, so the API's CORS
 * configuration must expose it explicitly or the browser's retry client
 * cannot read the delay it exists to communicate.
 */
export function resuming(retryAfterSeconds = 5): HttpResponse {
  return json(
    503,
    { error: 'database_resuming', retryAfter: retryAfterSeconds },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

/**
 * The waiting page, for the two entry points that are top-level navigations.
 *
 * `/auth/login` and `/auth/callback` are reached by the browser navigating,
 * not by fetch. A 503 with Retry-After is simply an error page to a
 * navigation — browsers do not retry it. So we answer 200 with a page that
 * re-requests the same URL.
 *
 * This is only safe because warming precedes anything irreversible: at
 * /auth/login nothing has happened yet, and at /auth/callback the code has
 * not been spent. Retrying is free in both cases.
 */
export function waitingPage(retryUrl: string, seconds = 4): HttpResponse {
  const escaped = retryUrl.replace(/"/g, '&quot;');
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Waking up…</title>
<meta http-equiv="refresh" content="${seconds};url=${escaped}">
<style>
  body { background:#0a1420; color:#e6eef5; font-family:ui-sans-serif,system-ui,sans-serif;
         display:grid; place-items:center; min-height:100vh; margin:0; text-align:center; }
  .box { max-width:26rem; padding:2rem; }
  h1 { font-size:1.25rem; margin:0 0 .75rem; }
  p { color:#8aa4b8; line-height:1.55; margin:0; font-size:.95rem; }
</style>
</head>
<body>
  <div class="box">
    <h1>Waking the database…</h1>
    <p>oddssea pauses its database when nobody is playing, which is why it
       costs almost nothing to run. Starting it takes about fifteen seconds —
       longer if it has been asleep a while. This page will retry itself.</p>
  </div>
</body>
</html>`,
  };
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  path?: string;
}

/**
 * Session cookies: `HttpOnly` so JavaScript cannot read them at all,
 * `Secure` so they never travel in clear, `SameSite=Lax` so they are not
 * sent on cross-site POSTs (the CSRF defence that only works because the BFF
 * is same-origin with the app, via the CloudFront /auth/* behaviour).
 */
export function setCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path ?? '/'}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  return parts.join('; ');
}

export function clearCookie(name: string, path = '/'): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    out[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return out;
}
