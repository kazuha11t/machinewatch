import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, onUnauthorized, setAuthToken } from './api';
import { getExpoPushToken, prepareNotifications } from './notifications';
import { tokenStorage } from './storage';
import type { User } from './types';

interface AuthContextValue {
  token: string | null;
  user: User | null;
  restoring: boolean;
  /** True once this device is registered for remote push; live alerts then skip local notifications. */
  remotePush: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [remotePush, setRemotePush] = useState(false);
  const pushToken = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setRemotePush(false);
    await tokenStorage.clear();
  }, []);

  const logout = useCallback(async () => {
    if (pushToken.current) {
      await api.unregisterPushToken(pushToken.current).catch(() => {});
      pushToken.current = null;
    }
    await clearSession();
  }, [clearSession]);

  useEffect(() => {
    onUnauthorized(() => void clearSession());
    return () => onUnauthorized(null);
  }, [clearSession]);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      const saved = await tokenStorage.get();
      if (!saved) return;
      setAuthToken(saved);
      try {
        const { user: restored } = await api.me();
        setUser(restored);
        setToken(saved);
      } catch {
        await clearSession();
      }
    })().finally(() => setRestoring(false));
  }, [clearSession]);

  // Register for push notifications whenever a session becomes active.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const allowed = await prepareNotifications().catch(() => false);
      if (!allowed || cancelled) return;
      const expoToken = await getExpoPushToken();
      if (!expoToken || cancelled) return;
      await api.registerPushToken(expoToken);
      pushToken.current = expoToken;
      setRemotePush(true);
    })().catch((err) => console.warn('[push] registration failed', err));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email.trim(), password);
    setAuthToken(result.token);
    await tokenStorage.set(result.token);
    setUser(result.user);
    setToken(result.token);
  }, []);

  const value = useMemo(
    () => ({ token, user, restoring, remotePush, login, logout }),
    [token, user, restoring, remotePush, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
