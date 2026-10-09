/**
 * src/app/QueryProvider.tsx
 * Owner: Dev1 | Issue: CATMS-056
 *
 * TanStack Query provider component wrapping app hierarchy.
 */

import { type ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { onSessionExpired } from '../api/client';

export interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  useEffect(() => {
    // When a 401 response occurs anywhere, invalidate the session query cache
    const unsubscribe = onSessionExpired(() => {
      queryClient.setQueryData(['session', 'me'], null);
      queryClient.invalidateQueries({ queryKey: ['session'] });
    });
    return unsubscribe;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
