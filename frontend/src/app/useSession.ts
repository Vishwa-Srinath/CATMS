/**
 * src/app/useSession.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Current-user session bootstrap, login, and logout hooks via TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginRequest, type SessionUserDto } from '../api/auth.api';
import { ApiError } from '../api/errors';

export const SESSION_QUERY_KEY = ['session', 'me'] as const;

export function useSession() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SessionUserDto | null, ApiError>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async ({ signal }) => {
      try {
        // Fast timeout controller (1.5 seconds max) so offline backend never freezes UI
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        if (signal) {
          signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const session = await authApi.getMe(controller.signal);
        clearTimeout(timeoutId);
        return session;
      } catch (err) {
        // If unauthenticated (401), backend offline (502/503/504), network error, or timeout:
        // treat safely as unauthenticated so the login page renders immediately
        // instead of staying permanently stuck on the skeleton screen.
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        console.warn('[useSession] Backend session unavailable – defaulting to offline/demo mode:', err);
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginRequest) => authApi.login(credentials),
    onSuccess: (data) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, data.user);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: Boolean(user),
    isError,
    error,
    refetch,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
