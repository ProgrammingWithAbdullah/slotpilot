import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppointmentDto, AvailabilityDto, CreateAppointmentInput, ServiceDto } from '@slotpilot/shared';
import { api, apiRequest } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSocketEvent } from '@/lib/socket';

export function useServices() {
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: ({ signal }) => api.get<ServiceDto[]>('/services', signal),
    staleTime: 10 * 60_000, // the catalog rarely changes
  });
}

export function useAvailability(serviceId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: queryKeys.availability(serviceId ?? '', date ?? ''),
    queryFn: ({ signal }) => api.get<AvailabilityDto>(`/availability?serviceId=${serviceId}&date=${date}`, signal),
    enabled: Boolean(serviceId && date),
    staleTime: 15_000,
  });
}

export function useAppointments(scope: 'upcoming' | 'past') {
  return useInfiniteQuery({
    queryKey: queryKeys.appointments.list(scope),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : '';
      const res = await apiRequest<AppointmentDto[]>(`/appointments?scope=${scope}&limit=10${cursor}`, { signal });
      return { items: res.data, nextCursor: res.meta?.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateAppointmentInput; idempotencyKey: string }) =>
      api.post<AppointmentDto>('/appointments', input, { 'Idempotency-Key': idempotencyKey }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      void qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AppointmentDto>(`/appointments/${id}/cancel`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      void qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

/** Socket events only invalidate the cache; components keep reading from queries. */
export function useAppointmentsRealtime() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
    void qc.invalidateQueries({ queryKey: ['availability'] });
  };
  useSocketEvent('appointment:created', refresh);
  useSocketEvent('appointment:updated', refresh);
}

export function newIdempotencyKey(prefix = 'book'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
