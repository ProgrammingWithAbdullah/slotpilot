import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, SignupInput, UserDto } from '@slotpilot/shared';
import { setUnauthorizedHandler } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { SocketProvider } from '@/lib/socket';
import { authApi } from './api';

interface AuthContextValue {
  user: UserDto | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (input: LoginInput) => Promise<UserDto>;
  signup: (input: SignupInput) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth state is just the cached result of GET /auth/me. The JWT lives in an httpOnly
 * cookie that JavaScript never sees.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal), staleTime: 5 * 60_000 });

  const clearSession = useCallback(() => {
    // Drop every cached query so no previous user's data stays in memory.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'business' });
    qc.setQueryData(queryKeys.me, null);
  }, [qc]);

  useEffect(() => setUnauthorizedHandler(clearSession), [clearSession]);

  const onAuthed = (user: UserDto) => {
    qc.setQueryData(queryKeys.me, user);
    return user;
  };
  const loginMutation = useMutation({ mutationFn: authApi.login, onSuccess: onAuthed });
  const signupMutation = useMutation({ mutationFn: authApi.signup, onSuccess: onAuthed });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      status: me.isPending ? 'loading' : me.data ? 'authenticated' : 'unauthenticated',
      login: loginMutation.mutateAsync,
      signup: signupMutation.mutateAsync,
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        clearSession();
      },
    }),
    [me.data, me.isPending, loginMutation.mutateAsync, signupMutation.mutateAsync, clearSession],
  );

  return (
    <AuthContext.Provider value={value}>
      <SocketProvider enabled={value.status === 'authenticated'}>{children}</SocketProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
