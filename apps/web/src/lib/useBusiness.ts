import { useQuery } from '@tanstack/react-query';
import type { BusinessDto } from '@slotpilot/shared';
import { api } from './api';
import { queryKeys } from './queryKeys';

export function useBusiness() {
  return useQuery({
    queryKey: queryKeys.business,
    queryFn: ({ signal }) => api.get<BusinessDto>('/business', signal),
    staleTime: Infinity,
  });
}

/** Timezone used for all formatting; falls back to the browser's until loaded. */
export function useBusinessTimezone(): string {
  return useBusiness().data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
