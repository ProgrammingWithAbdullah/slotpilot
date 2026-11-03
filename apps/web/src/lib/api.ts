import type { ApiErrorBody, ApiSuccess, ErrorCode, FieldErrors } from '@slotpilot/shared';

export const API_BASE = '/api/v1';

/** Every failed request becomes an ApiError. Components switch on `code`, never on message text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): FieldErrors {
    return this.code === 'VALIDATION_ERROR' && this.details && typeof this.details === 'object'
      ? (this.details as FieldErrors)
      : {};
  }
}

export function isApiError(err: unknown, code?: ApiError['code']): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

let onUnauthorized: (() => void) | undefined;
/** Registered by the auth provider: any 401 from a protected endpoint logs the user out. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<ApiSuccess<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return { data: undefined as T };

  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiErrorBody | null;
  if (!res.ok) {
    const e = json && 'error' in json ? json.error : undefined;
    const error = new ApiError(
      res.status,
      e?.code ?? 'INTERNAL_ERROR',
      e?.message ?? 'Something went wrong. Please try again.',
      e?.details,
      e?.requestId,
    );
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    throw error;
  }
  return json as ApiSuccess<T>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }).then((r) => r.data),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(path, { method: 'POST', body: body ?? {}, headers }).then((r) => r.data),
};
