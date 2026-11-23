import type { Role } from '@invoxa/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, login as loginRequest, registerAccount } from '../api/endpoints';
import { setActiveBusinessIdHeader, setSessionToken, setUnauthorizedHandler } from '../api/client';
import { readSecure, removeSecure, StorageKeys, writeSecure } from '../lib/storage';
import type { BusinessRef, User } from '../api/types';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  businesses: BusinessRef[];
  activeBusinessId: string | null;
  activeRole: Role | null;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    businessName?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveBusiness: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function pickActiveId(storedId: string | null, businesses: BusinessRef[]): string | null {
  if (storedId && businesses.some((business) => business.id === storedId)) return storedId;
  return businesses[0]?.id ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRef[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);

  const applySession = useCallback(
    async (
      token: string,
      nextUser: User,
      nextBusinesses: BusinessRef[],
      businessId?: string | null,
    ) => {
      const active = pickActiveId(businessId ?? null, nextBusinesses);
      setSessionToken(token);
      setActiveBusinessIdHeader(active);
      setUser(nextUser);
      setBusinesses(nextBusinesses);
      setActiveBusinessId(active);
      setStatus('signedIn');
      await Promise.all([
        writeSecure(StorageKeys.token, token),
        writeSecure(StorageKeys.user, JSON.stringify(nextUser)),
        writeSecure(StorageKeys.businesses, JSON.stringify(nextBusinesses)),
        active ? writeSecure(StorageKeys.businessId, active) : removeSecure(StorageKeys.businessId),
      ]);
    },
    [],
  );

  const signOut = useCallback(async () => {
    setSessionToken(null);
    setActiveBusinessIdHeader(null);
    setStatus('signedOut');
    setUser(null);
    setBusinesses([]);
    setActiveBusinessId(null);
    queryClient.clear();
    await Promise.all([
      removeSecure(StorageKeys.token),
      removeSecure(StorageKeys.user),
      removeSecure(StorageKeys.businesses),
      removeSecure(StorageKeys.businessId),
    ]);
  }, [queryClient]);

  // A 401 from any screen ends the session here, in one place.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Boot from the stored snapshot first, so a restart is instant and works
  // while the free API host is still waking up.
  useEffect(() => {
    let active = true;

    const boot = async () => {
      const [token, storedUser, storedBusinesses, storedBusinessId] = await Promise.all([
        readSecure(StorageKeys.token),
        readSecure(StorageKeys.user),
        readSecure(StorageKeys.businesses),
        readSecure(StorageKeys.businessId),
      ]);

      const parsedUser = parseJson<User>(storedUser);
      const parsedBusinesses = parseJson<BusinessRef[]>(storedBusinesses) ?? [];

      if (!token) {
        if (active) setStatus('signedOut');
        return;
      }

      setSessionToken(token);
      if (parsedUser) {
        const activeId = pickActiveId(storedBusinessId, parsedBusinesses);
        setActiveBusinessIdHeader(activeId);
        if (active) {
          setUser(parsedUser);
          setBusinesses(parsedBusinesses);
          setActiveBusinessId(activeId);
          setStatus('signedIn');
        }
      }

      try {
        const me = await fetchMe();
        if (!active) return;
        await applySession(token, me.user, me.businesses, storedBusinessId);
      } catch {
        // Offline or waking: the stored snapshot stays valid.
        if (parsedUser) return;
        if (active) setStatus('signedOut');
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, [applySession]);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await loginRequest(input);
      setSessionToken(result.token);
      let nextBusinesses: BusinessRef[] = [];
      try {
        const me = await fetchMe();
        nextBusinesses = me.businesses;
      } catch {
        nextBusinesses = result.business ? [result.business] : [];
      }
      await applySession(result.token, result.user, nextBusinesses);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; businessName?: string }) => {
      const result = await registerAccount(input);
      setSessionToken(result.token);
      const nextBusinesses = result.business ? [result.business] : [];
      await applySession(result.token, result.user, nextBusinesses, result.business?.id);
    },
    [applySession],
  );

  const setActiveBusiness = useCallback(
    (id: string) => {
      if (!businesses.some((business) => business.id === id)) return;
      setActiveBusinessId(id);
      setActiveBusinessIdHeader(id);
      void writeSecure(StorageKeys.businessId, id);
      queryClient.clear();
    },
    [businesses, queryClient],
  );

  const activeRole = useMemo<Role | null>(
    () => businesses.find((business) => business.id === activeBusinessId)?.role ?? null,
    [businesses, activeBusinessId],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      businesses,
      activeBusinessId,
      activeRole,
      signIn,
      register,
      signOut,
      setActiveBusiness,
    }),
    [
      status,
      user,
      businesses,
      activeBusinessId,
      activeRole,
      signIn,
      register,
      signOut,
      setActiveBusiness,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
