import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessageDto, ChatSessionDto } from '@slotpilot/shared';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useOnReconnect, useSocketEvent, useSocketStatus } from '@/lib/socket';

export const POLL_INTERVAL_MS = 2000;
export const REPLY_TIMEOUT_MS = 25_000;

/** A message shown before the server confirms it (negative temporary id). */
export type UiMessage = ChatMessageDto & { pending?: boolean };

function mergeMessages(existing: UiMessage[] = [], incoming: UiMessage[]): UiMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    // Pending (negative id) messages always stay at the end.
    if (a.id < 0 !== b.id < 0) return a.id < 0 ? 1 : -1;
    return a.id - b.id;
  });
}

/**
 * Everything the chat widget needs. Sending is a REST call; replies arrive over the socket.
 * If the socket is down while a reply is pending, we poll instead (near-real-time fallback).
 * "Waiting for a reply" is DERIVED from the data (last message is the user's), not stored.
 */
export function useChat() {
  const qc = useQueryClient();
  const socketStatus = useSocketStatus();
  const [typing, setTyping] = useState(false);

  const session = useQuery({
    queryKey: queryKeys.chat.activeSession,
    queryFn: async () => {
      const sessions = await api.get<ChatSessionDto[]>('/chat/sessions');
      return sessions.find((s) => s.state !== 'closed') ?? api.post<ChatSessionDto>('/chat/sessions');
    },
    staleTime: Infinity,
  });
  const sessionId = session.data?.id;

  const lastMessageIsUser = (data?: UiMessage[]) => {
    const last = data?.[data.length - 1];
    return Boolean(last && last.role === 'user' && !last.pending);
  };

  const messages = useQuery({
    queryKey: queryKeys.chat.messages(sessionId ?? ''),
    queryFn: ({ signal }) => api.get<ChatMessageDto[]>(`/chat/sessions/${sessionId}/messages`, signal),
    enabled: Boolean(sessionId),
    // Polling fallback: only while a reply is pending AND the socket is not connected.
    refetchInterval: (q) =>
      lastMessageIsUser(q.state.data) && socketStatus !== 'connected' ? POLL_INTERVAL_MS : false,
  });

  const awaitingReply = lastMessageIsUser(messages.data);

  // Timeout UX: if no reply after a while, offer Retry / form instead of an endless spinner.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!awaitingReply) return;
    const t = setTimeout(() => setTimedOut(true), REPLY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [awaitingReply, messages.data?.length]);

  const appendToCache = (incoming: UiMessage[]) =>
    qc.setQueryData<UiMessage[]>(queryKeys.chat.messages(sessionId ?? ''), (old) => mergeMessages(old, incoming));

  useSocketEvent('chat:typing', ({ sessionId: sid, isTyping }) => {
    if (sid === sessionId) setTyping(isTyping);
  });
  useSocketEvent('chat:message', ({ sessionId: sid, message, draft, state }) => {
    if (sid !== sessionId) {
      // e.g. a new conversation started in another tab
      void qc.invalidateQueries({ queryKey: queryKeys.chat.activeSession });
      return;
    }
    setTyping(false);
    appendToCache([message]);
    qc.setQueryData<ChatSessionDto>(queryKeys.chat.activeSession, (s) => (s ? { ...s, draft, state } : s));
  });
  useOnReconnect(() => {
    void qc.invalidateQueries({ queryKey: ['chat'] });
  });

  const send = useMutation({
    mutationFn: (content: string) => api.post<ChatMessageDto>(`/chat/sessions/${sessionId}/messages`, { content }),
    onMutate: (content) => {
      const temp: UiMessage = {
        id: -Date.now(),
        sessionId: sessionId!,
        role: 'user',
        content,
        metadata: {},
        createdAt: new Date().toISOString(),
        pending: true,
      };
      appendToCache([temp]);
      return { tempId: temp.id };
    },
    onSuccess: (saved, _content, ctx) => {
      qc.setQueryData<UiMessage[]>(queryKeys.chat.messages(sessionId!), (old) =>
        mergeMessages(
          old?.filter((m) => m.id !== ctx?.tempId),
          [saved],
        ),
      );
    },
    onError: (_err, _content, ctx) => {
      qc.setQueryData<UiMessage[]>(queryKeys.chat.messages(sessionId!), (old) =>
        old?.filter((m) => m.id !== ctx?.tempId),
      );
    },
  });

  const newConversation = useMutation({
    mutationFn: () => api.post<ChatSessionDto>('/chat/sessions'),
    onSuccess: (s) => {
      setTyping(false);
      send.reset();
      qc.setQueryData(queryKeys.chat.activeSession, s);
    },
  });

  return {
    session,
    messages,
    send,
    newConversation,
    socketStatus,
    typing: typing || awaitingReply,
    awaitingReply,
    timedOut,
    refresh: () => void messages.refetch(),
  };
}
