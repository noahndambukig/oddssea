import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getAccessToken, login as doLogin, logout as doLogout, ResumingError } from './auth-client';
import { decodeJwtPayload, loadTokens } from './token-store';
import { call } from '../api-client';
import { loadRuntimeConfig, type RuntimeConfig } from '../runtime-config';

/**
 * `waking` is a first-class status now, not an error.
 *
 * The database pauses when nobody is playing — that is why this project
 * costs almost nothing to run — so a cold first request genuinely takes
 * 15–30 seconds. Rendering that honestly is better than a spinner that
 * looks broken.
 *
 * Note what is NOT here any more: the single-flight guard around the
 * callback exchange. React StrictMode still double-runs effects, but the
 * browser no longer performs an exchange at all — the BFF does, server-side,
 * and its replay protection is a database lease keyed by OAuth state plus an
 * httpOnly cookie. The guard had nothing left to protect.
 */
type Status = 'loading' | 'waking' | 'anonymous' | 'authenticated' | 'error';

export interface Me {
  sub: string;
  attestedAt: string | null;
  shells: number;
  pearls: number;
  streak: number;
  lastClaimDate: string | null;
}

interface AuthState {
  status: Status;
  config: RuntimeConfig | null;
  error: string | null;
  profile: Record<string, unknown> | null;
  me: Me | null;
  refreshMe: () => Promise<void>;
  applyMe: (next: Me) => void;
  login: (options?: { signUp?: boolean }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async (loaded: RuntimeConfig) => {
    const next = await call<Me>(loaded, '/me', {
      onWaking: () => setStatus('waking'),
    });
    setMe(next);
    const tokens = loadTokens();
    if (tokens) setProfile(decodeJwtPayload(tokens.idToken));
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadRuntimeConfig();
        if (cancelled) return;
        setConfig(loaded);

        // A session lives in an httpOnly cookie, so "am I signed in?" is a
        // question only the server can answer.
        const token = await getAccessToken().catch((e) => {
          if (e instanceof ResumingError) {
            setStatus('waking');
            return null;
          }
          throw e;
        });

        if (cancelled) return;
        if (!token) {
          setStatus('anonymous');
          return;
        }
        await loadMe(loaded);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const refreshMe = useCallback(async () => {
    if (config) await loadMe(config);
  }, [config, loadMe]);

  /** Economic responses already carry the new balances — no extra round trip. */
  const applyMe = useCallback((next: Me) => setMe(next), []);

  const login = useCallback((options: { signUp?: boolean } = {}) => {
    doLogin({ ...options, returnTo: window.location.pathname });
  }, []);

  const logout = useCallback(() => {
    if (config) void doLogout(config);
  }, [config]);

  const value = useMemo<AuthState>(
    () => ({ status, config, error, profile, me, refreshMe, applyMe, login, logout }),
    [status, config, error, profile, me, refreshMe, applyMe, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
