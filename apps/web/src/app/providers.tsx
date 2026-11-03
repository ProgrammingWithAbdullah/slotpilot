import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/features/auth/AuthProvider';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
