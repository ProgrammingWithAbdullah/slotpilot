import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@slotpilot/shared';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketStatus = 'connecting' | 'connected' | 'disconnected';

const SocketContext = createContext<{ socket: AppSocket | null; status: SocketStatus }>({
  socket: null,
  status: 'disconnected',
});

/**
 * One Socket.IO connection per signed-in user. Same origin, so the httpOnly session
 * cookie authenticates the handshake. Socket.IO reconnects (and falls back to
 * long-polling) on its own.
 */
export function SocketProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [status, setStatus] = useState<SocketStatus>('disconnected');

  useEffect(() => {
    if (!enabled) return;
    const s: AppSocket = io({ path: '/socket.io', withCredentials: true });
    setSocket(s);
    setStatus('connecting');
    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('disconnected'));
    s.on('connect_error', () => setStatus('disconnected'));
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setStatus('disconnected');
    };
  }, [enabled]);

  return <SocketContext.Provider value={{ socket, status }}>{children}</SocketContext.Provider>;
}

export function useSocketStatus(): SocketStatus {
  return useContext(SocketContext).status;
}

/** Subscribes to a server event for the lifetime of the component; the handler can change freely. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]) {
  const { socket } = useContext(SocketContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = ((...args: Parameters<ServerToClientEvents[E]>) =>
      (ref.current as (...a: unknown[]) => void)(...args)) as unknown as ServerToClientEvents[E];
    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [socket, event]);
}

/** Runs `onReconnect` after the socket comes back (to catch up on missed events). */
export function useOnReconnect(onReconnect: () => void) {
  const { socket } = useContext(SocketContext);
  const ref = useRef(onReconnect);
  ref.current = onReconnect;
  useEffect(() => {
    if (!socket) return;
    let wasConnected = socket.connected;
    const handler = () => {
      if (wasConnected) ref.current();
      wasConnected = true;
    };
    socket.on('connect', handler);
    return () => {
      socket.off('connect', handler);
    };
  }, [socket]);
}
