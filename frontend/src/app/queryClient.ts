/**
 * src/app/queryClient.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Central TanStack QueryClient instance and global cache configuration.
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds fresh
      gcTime: 5 * 60_000, // 5 minutes cache retention
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Do not retry on client auth or validation errors
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 422) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
