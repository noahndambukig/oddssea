import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  beginLogin,
  completeLogin,
  getAccessToken,
  logout as doLogout,
  type CompleteLoginResult,
} from './auth-client';
import { clearTokens, decodeJwtPayload, loadTokens } from './token-store';
import { fetchAttestedAt } from './user-api';
import { loadRuntimeConfig, type RuntimeConfig } from '../runtime-config';

type Status = 'loading' | 'anonymous' | 'authenticated' | 'error';

interface AuthState {
  status: Status;
  config: RuntimeConfig | null;
  error: string | null;
  /** Claims decoded from the ID token — who the user is. Display only. */
  profile: Record<string, unknown> | null;
  /** ISO timestamp of the 18+ attestation, or null if not yet attested. */
  attestedAt: string | null;
  markAttested: (isoTimestamp: string) => void;
  login: (options?: { signUp?: boolean }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * SINGLE-FLIGHT guard for the callback exchange.
 *
 * React StrictMode double-runs effects in development (main.tsx wraps the
 * app in it), and the PKCE verifier is deliberately single-use — a second
 * entry into completeLogin() would find it consumed and break local login.
 * Module scope survives the double-mount; both runs await the same promise.
 */
let callbackExchange: Promise<CompleteLoginResult> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [attestedAt, setAttestedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadRuntimeConfig();
        if (cancelled) return;
        setConfig(loaded);

        // Mid-login? /callback is where Cognito sends the user back.
        if (window.location.pathname === '/callback') {
          callbackExchange ??= completeLogin(loaded, window.location.search);
          const { tokens, returnTo } = await callbackExchange;
          if (cancelled) return;
          const claims = decodeJwtPayload(tokens.idToken);
          setProfile(claims);
          setAttestedAt(await resolveAttested(loaded, claims));
          if (cancelled) return;
          setStatus('authenticated');
          // replaceState, not pushState: the back button must never return
          // to a URL containing a spent authorization code.
          window.history.replaceState({}, '', returnTo);
          return;
        }

        // Not mid-login — do we already hold usable tokens in this tab?
        const existing = loadTokens();
        if (existing && (await getAccessToken(loaded))) {
          if (cancelled) return;
          const claims = decodeJwtPayload(loadTokens()!.idToken);
          setProfile(claims);
          setAttestedAt(await resolveAttested(loaded, claims));
          if (cancelled) return;
          setStatus('authenticated');
        } else {
          if (cancelled) return;
          setStatus('anonymous');
        }
      } catch (e) {
        if (cancelled) return;
        clearTokens();
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    (options: { signUp?: boolean } = {}) => {
      if (!config) return;
      void beginLogin(config, { ...options, returnTo: window.location.pathname });
    },
    [config],
  );

  const logout = useCallback(() => {
    if (!config) return;
    callbackExchange = null;
    doLogout(config);
  }, [config]);

  const markAttested = useCallback((isoTimestamp: string) => {
    setAttestedAt(isoTimestamp);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, config, error, profile, attestedAt, markAttested, login, logout }),
    [status, config, error, profile, attestedAt, markAttested, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Is this user attested? The ID token's claim is the cheap answer, but a
 * locally stored token can simply PREDATE the attestation — custom
 * attributes only appear in tokens minted after the write. When the claim
 * is absent, GetUser gives the authoritative answer before we show a gate
 * the user may have already passed.
 */
async function resolveAttested(
  config: RuntimeConfig,
  claims: Record<string, unknown> | null,
): Promise<string | null> {
  const fromClaim = claims?.['custom:age_attested_at'];
  if (typeof fromClaim === 'string' && fromClaim) return fromClaim;

  const accessToken = await getAccessToken(config);
  if (!accessToken) return null;
  try {
    return await fetchAttestedAt(config, accessToken);
  } catch {
    // Can't reach the API — err on the side of showing the gate; a second
    // confirmation is annoying, an unattested user in a gambling simulator
    // is a compliance failure.
    return null;
  }
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
