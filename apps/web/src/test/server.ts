import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { business, services, user } from './fixtures';

/** Default happy-path API. Tests override individual handlers with server.use(...). */
export const handlers = [
  http.get('*/api/v1/business', () => HttpResponse.json({ data: business })),
  http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: user })),
  http.get('*/api/v1/services', () => HttpResponse.json({ data: services })),
  http.get('*/api/v1/appointments', () => HttpResponse.json({ data: [], meta: { nextCursor: null } })),
];

export const server = setupServer(...handlers);

export const apiError = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details, requestId: 'req-1' } }, { status });
