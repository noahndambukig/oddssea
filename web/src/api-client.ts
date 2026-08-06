/**
 * Calling the API, including the two things that make it different from a
 * normal fetch wrapper.
 *
 * COLD STARTS ARE ROUTINE. The database pauses when idle — that is the whole
 * cost model — so the first request after a quiet spell gets a 503 while it
 * wakes. That is an expected state, not an error, and it cannot be waited
 * out server-side: HTTP APIs cap integration timeout near 29s and a resume
 * can take longer. So the retry lives here.
 *
 * RETRIES MUST NOT DOUBLE-CHARGE. Every economic call carries an
 * Idempotency-Key, generated ONCE per user action and reused across every
 * retry of that action. The server records the key in the same transaction
 * as the money and returns the stored response on a replay, so retrying is
 * free. Generating a fresh key per retry would defeat the entire mechanism.
 */

import { getAccessToken, ResumingError } from './auth/auth-client';
import type { RuntimeConfig } from './runtime-config';

export interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Required for economic routes; stable across retries of one action. */
  idempotencyKey?: string;
  /** Called when a cold start is detected, so the UI can say so. */
  onWaking?: (attempt: number, retryAfterSeconds: number) => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const MAX_WAKE_ATTEMPTS = 8;

export async function call<T>(
  config: RuntimeConfig,
  path: string,
  options: CallOptions = {},
): Promise<T> {
  const { method = 'GET', body, idempotencyKey, onWaking } = options;

  for (let attempt = 1; attempt <= MAX_WAKE_ATTEMPTS; attempt += 1) {
    let token: string | null;
    try {
      token = await getAccessToken();
    } catch (error) {
      // Even obtaining a token can hit the sleeping database, because the
      // BFF's refresh reads the session from it.
      if (error instanceof ResumingError) {
        onWaking?.(attempt, error.retryAfterSeconds);
        await sleep(error.retryAfterSeconds);
        continue;
      }
      throw error;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    // The SAME key on every attempt — that is the point.
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 503) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 5);
      onWaking?.(attempt, retryAfter);
      await sleep(retryAfter);
      continue;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = (payload ?? {}) as { error?: string; detail?: string };
      throw new ApiError(response.status, error.error ?? 'request_failed', error.detail);
    }

    return payload as T;
  }

  throw new ApiError(503, 'database_still_waking');
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * One key per user action. `crypto.randomUUID` is available in every browser
 * this app supports and is cryptographically random, which matters only in
 * that keys must not collide between players.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
