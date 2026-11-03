import type { LoginInput, SignupInput, UserDto } from '@slotpilot/shared';
import { api, isApiError } from '@/lib/api';

export const authApi = {
  /** null when not logged in (401), so "logged out" is a normal state, not an error. */
  me: async (signal?: AbortSignal): Promise<UserDto | null> => {
    try {
      return await api.get<UserDto>('/auth/me', signal);
    } catch (err) {
      if (isApiError(err) && err.status === 401) return null;
      throw err;
    }
  },
  login: (input: LoginInput) => api.post<UserDto>('/auth/login', input),
  signup: (input: SignupInput) => api.post<UserDto>('/auth/signup', input),
  logout: () => api.post<void>('/auth/logout'),
};
