import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // Don't retry client errors (401/404/400); do retry flaky network/5xx once.
        retry: (count, err) => count < 1 && !(isApiError(err) && err.status >= 400 && err.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
