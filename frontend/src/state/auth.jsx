import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthenticatedHandler } from '../api/client.js';
import { toastBus } from './toastBus.js';
import { can } from '../lib/permissions.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get('/auth/me')).user;
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      if (qc.getQueryData(['me'])) {
        toastBus.error('Tu sesión expiró. Volvé a entrar: lo que estabas escribiendo quedó guardado.');
      }
      qc.setQueryData(['me'], null);
    });
  }, [qc]);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], user);
    return user;
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], null);
  }, [qc]);

  const setUser = useCallback((user) => qc.setQueryData(['me'], user), [qc]);

  const value = useMemo(() => ({
    user: me.data ?? null,
    status: me.isPending ? 'loading' : me.isError ? 'error' : me.data ? 'in' : 'out',
    login, logout, setUser, retry: me.refetch,
  }), [me.data, me.isPending, me.isError, me.refetch, login, logout, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useCan() {
  const { user } = useAuth();
  return useCallback((section, level = 'view') => can(user, section, level), [user]);
}
