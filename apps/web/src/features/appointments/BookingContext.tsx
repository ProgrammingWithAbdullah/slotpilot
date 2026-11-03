import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { BookingDialog, type BookingInitialValues } from './BookingDialog';

const BookingContext = createContext<((initial?: BookingInitialValues) => void) | null>(null);

/**
 * One booking form for the whole page. Anything (the "Book" button, a chat card's
 * "Edit" or the AI fallback) can open it, optionally pre-filled.
 */
export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; initial?: BookingInitialValues; key: number }>({
    open: false,
    key: 0,
  });
  const open = useCallback(
    (initial?: BookingInitialValues) => setState((s) => ({ open: true, initial, key: s.key + 1 })),
    [],
  );
  return (
    <BookingContext.Provider value={open}>
      {children}
      <BookingDialog
        key={state.key}
        open={state.open}
        initial={state.initial}
        onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
      />
    </BookingContext.Provider>
  );
}

export function useOpenBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useOpenBooking must be used inside <BookingProvider>');
  return ctx;
}
