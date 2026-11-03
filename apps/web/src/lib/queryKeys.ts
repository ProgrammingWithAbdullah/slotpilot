/** One place for cache keys, so invalidation can't drift from the queries. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  business: ['business'] as const,
  services: ['services'] as const,
  availability: (serviceId: string, date: string) => ['availability', serviceId, date] as const,
  appointments: {
    all: ['appointments'] as const,
    list: (scope: 'upcoming' | 'past') => ['appointments', 'list', scope] as const,
  },
  chat: {
    all: ['chat'] as const,
    activeSession: ['chat', 'active-session'] as const,
    messages: (sessionId: string) => ['chat', 'messages', sessionId] as const,
  },
};
