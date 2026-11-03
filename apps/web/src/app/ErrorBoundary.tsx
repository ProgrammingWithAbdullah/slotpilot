import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Last line of defence: a render error shows a friendly screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console -- surface crashes in the browser console
    console.error('UI crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-fg-muted">The page hit an unexpected error. Reloading usually fixes it.</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        </div>
      </div>
    );
  }
}
