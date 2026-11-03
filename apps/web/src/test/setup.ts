import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

// The app calls fetch('/api/...') with relative URLs, like a browser. Resolve them against jsdom's origin.
const realFetch = globalThis.fetch;
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, window.location.origin) : input, init);

// The socket never connects in tests, which exercises the polling fallback.
vi.mock('socket.io-client', () => ({
  io: () => {
    const handlers = new Map<string, Set<(...a: unknown[]) => void>>();
    return {
      connected: false,
      on: (e: string, h: (...a: unknown[]) => void) => (handlers.get(e) ?? handlers.set(e, new Set()).get(e)!).add(h),
      off: (e: string, h: (...a: unknown[]) => void) => handlers.get(e)?.delete(h),
      removeAllListeners: () => handlers.clear(),
      disconnect: () => undefined,
    };
  },
}));

window.matchMedia ??= ((query: string) => ({
  matches: query.includes('min-width: 1024px'),
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
Element.prototype.scrollTo ??= () => undefined;
HTMLElement.prototype.scrollTo ??= () => undefined;
if (!crypto.randomUUID) {
  Object.defineProperty(crypto, 'randomUUID', { value: () => '00000000-0000-4000-8000-000000000000' });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
