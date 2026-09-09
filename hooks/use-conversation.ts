'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/client';
import type { ChatMessage, Conversation, Game } from '@/lib/domain';
export type ChatEvent = {
  type: string;
  message?: ChatMessage;
  game?: Game;
  profileId?: string;
  typing?: boolean;
  online?: boolean;
  ended?: boolean;
  error?: string;
  from?: string;
  signal?: unknown;
};
function merge(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming)
    byId.set(message.id, { ...message, state: 'sent' });
  return [...byId.values()].sort(
    (a, b) =>
      (a.sequence || Number.MAX_SAFE_INTEGER) -
        (b.sequence || Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt,
  );
}
export function useConversation(
  chat: Conversation | null,
  profileId: string,
  onEvent: (event: ChatEvent) => void,
) {
  const chatId = chat?.id,
    endedAt = chat?.endedAt;
  const [messageState, setMessageState] = useState<{
      chatId?: string;
      messages: ChatMessage[];
    }>({ messages: [] }),
    [connection, setConnection] = useState<
      'connecting' | 'online' | 'reconnecting' | 'offline'
    >('connecting'),
    [typing, setTyping] = useState(false);
  const messages =
    messageState.chatId === chat?.id ? messageState.messages : [];
  const setMessages = useCallback(
    (update: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) => {
      setMessageState((previous) => ({
        chatId,
        messages:
          typeof update === 'function'
            ? update(previous.chatId === chatId ? previous.messages : [])
            : update,
      }));
    },
    [chatId],
  );
  const activeChat = useRef(chat?.id);
  activeChat.current = chat?.id;
  const socket = useRef<WebSocket | null>(null),
    callback = useRef(onEvent),
    typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  callback.current = onEvent;
  useEffect(() => {
    setMessages([]);
    setTyping(false);
    if (!chatId) return;
    let alive = true,
      cursor = 0,
      retries = 0,
      lastPong = Date.now(),
      polling = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const pendingKey = `elsewhere-pending:${profileId}:${chatId}`;
    try {
      const pending = JSON.parse(
        sessionStorage.getItem(pendingKey) ?? '[]',
      ) as ChatMessage[];
      if (Array.isArray(pending))
        setMessages(
          pending
            .filter((m) => m.chatId === chatId && m.senderId === profileId)
            .map((m) => ({ ...m, state: 'failed' })),
        );
    } catch {}
    async function poll() {
      if (!alive || polling || !navigator.onLine) return;
      polling = true;
      try {
        let more = true;
        while (more && alive) {
          const result = await api<{
            messages: ChatMessage[];
            hasMore: boolean;
          }>(`/chats/${encodeURIComponent(chatId!)}/messages?after=${cursor}`);
          if (!alive) return;
          setMessages((prev) => merge(prev, result.messages));
          if (result.messages.length) cursor = result.messages.at(-1)!.sequence;
          more = result.hasMore;
        }
        const game = await api<Game | null>(
          `/chats/${encodeURIComponent(chatId!)}/games`,
        );
        if (alive && game) callback.current({ type: 'game_sync', game });
      } catch {
      } finally {
        polling = false;
      }
    }
    async function connect() {
      if (!alive || endedAt) return;
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }
      setConnection(retries ? 'reconnecting' : 'connecting');
      try {
        const ticket = await api<{ url: string }>('/socket-ticket', {
          method: 'POST',
          body: JSON.stringify({ chatId: chatId }),
        });
        if (!alive) return;
        const ws = new WebSocket(ticket.url);
        socket.current = ws;
        ws.onopen = () => {
          if (!alive) {
            ws.close();
            return;
          }
          retries = 0;
          lastPong = Date.now();
          setConnection('online');
          void poll();
        };
        ws.onmessage = (event) => {
          if (!alive) return;
          let data: ChatEvent;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (data.type === 'pong') {
            lastPong = Date.now();
            return;
          }
          if (data.type === 'message' && data.message)
            setMessages((prev) => merge(prev, [data.message!]));
          if (data.type === 'typing' && data.profileId !== profileId) {
            setTyping(!!data.typing);
            clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 6000);
          }
          callback.current(data);
        };
        ws.onclose = () => {
          if (alive) {
            setConnection(navigator.onLine ? 'reconnecting' : 'offline');
            schedule();
          }
        };
        ws.onerror = () => ws.close();
      } catch {
        if (alive) {
          setConnection(navigator.onLine ? 'reconnecting' : 'offline');
          schedule();
        }
      }
    }
    function schedule() {
      if (!alive || endedAt) return;
      clearTimeout(reconnect);
      reconnect = setTimeout(
        connect,
        Math.min(30000, 1000 * 2 ** Math.min(retries++, 5)) +
          Math.random() * 500,
      );
    }
    const heartbeat = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPong > 50000) {
          socket.current.close();
          return;
        }
        socket.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
    const pollInterval = setInterval(() => {
      if (!endedAt) void poll();
    }, 5000);
    const onOnline = () => {
      clearTimeout(reconnect);
      if (socket.current?.readyState !== WebSocket.OPEN) void connect();
      void poll();
    };
    const onOffline = () => {
      setConnection('offline');
      socket.current?.close();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void poll();
    if (!endedAt) void connect();
    return () => {
      alive = false;
      clearTimeout(reconnect);
      clearTimeout(typingTimer.current);
      clearInterval(heartbeat);
      clearInterval(pollInterval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      socket.current?.close(1000, 'Leaving conversation');
      socket.current = null;
    };
  }, [chatId, endedAt, profileId, setMessages]);
  useEffect(() => {
    if (!chatId || messageState.chatId !== chatId) return;
    try {
      const pending = messageState.messages.filter(
        (m) => m.senderId === profileId && m.state !== 'sent',
      );
      sessionStorage.setItem(
        `elsewhere-pending:${profileId}:${chatId}`,
        JSON.stringify(pending),
      );
    } catch {}
  }, [messageState, chatId, profileId]);
  const send = useCallback(
    async (message: ChatMessage) => {
      if (!chatId) return;
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== message.id),
        { ...message, state: 'sending' },
      ]);
      try {
        const saved = await api<ChatMessage>(
          `/chats/${encodeURIComponent(chatId)}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: message.id,
              text: message.text,
              kind: message.kind,
              mediaId: message.mediaId,
            }),
          },
        );
        if (activeChat.current === chatId)
          setMessages((prev) => merge(prev, [saved]));
        return true;
      } catch (error) {
        if (activeChat.current !== chatId) return false;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, state: 'failed' } : m,
          ),
        );
        callback.current({ type: 'send_error', error: errorText(error) });
        return false;
      }
    },
    [chatId, setMessages],
  );
  const emit = useCallback((event: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(event));
      return true;
    }
    return false;
  }, []);
  return { messages, connection, typing, send, emit };
}
