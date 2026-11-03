import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { BookingProvider } from '@/features/appointments/BookingContext';

export function renderApp(ui: ReactElement, { route = '/' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <BookingProvider>{ui}</BookingProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
