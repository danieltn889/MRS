// hooks/useChat.ts - NO AUTO-REFRESH (Manual refresh only)

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import simulationAPI, { SOCKET_BASE_URL } from '../../../services/simulationAPI';

export interface ChatMessage {
  id: string;
  user_id?: string;
  user_email?: string;
  message: string;
  message_type?: string;
  timestamp: string;
  created_at?: string;
  reply_to?: string | null;
  thread_id?: string | null;
  reply_count?: number;
  is_read?: boolean;
  simulation_id?: string;
  session_id?: string;
  recipient_id?: string | null;
  author?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    user_type: string;
  };
  replied_to_message?: {
    id: string;
    message: string;
    user_id?: string;
    user_email?: string;
    author?: { id: string; email: string; name?: string };
  };
  replies?: ChatMessage[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

export interface ParsedChatMessage {
  text: string;
  attachments: ChatAttachment[];
  raw: string;
}

export const parseChatMessage = (message: any): ParsedChatMessage => {
  if (!message) return { text: '', attachments: [], raw: '' };

  const raw = typeof message === 'string' ? message : JSON.stringify(message);
  let text = '';
  let attachments: ChatAttachment[] = [];

  let current: any = typeof message === 'string' ? message : JSON.stringify(message);
  const maxDepth = 20;
  let depth = 0;

  while (depth < maxDepth) {
    depth++;

    if (typeof current === 'string') {
      const trimmed = current.trim();

      if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('"')) {
        text = current;
        break;
      }

      try {
        current = JSON.parse(current);
        continue;
      } catch {
        const unescapedInner = current.match(/^\{"text":"(\{.+)/s);
        if (unescapedInner) {
          current = unescapedInner[1];
          continue;
        }
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          text = '';
        } else {
          text = current;
        }
        break;
      }
    }

    if (current && typeof current === 'object' && !Array.isArray(current)) {
      if (
        attachments.length === 0 &&
        Array.isArray(current.attachments) &&
        current.attachments.length > 0
      ) {
        attachments = current.attachments;
      }

      if (current.text !== undefined) {
        current = current.text;
        continue;
      }

      if (current.parsed_message !== undefined) {
        current = current.parsed_message;
        continue;
      }

      text = '';
      break;
    }

    text = '';
    break;
  }

  if (typeof text === 'string' && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
    try {
      const lastAttempt = JSON.parse(text);
      if (lastAttempt?.attachments && attachments.length === 0) {
        attachments = lastAttempt.attachments;
      }
      text = lastAttempt?.text ?? '';
    } catch {
      text = '';
    }
  }

  if (typeof text === 'string') {
    text = text
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  return { text, attachments, raw };
};

export const getMessageText = (msg: ChatMessage): string => {
  return parseChatMessage(msg.message || '').text;
};

function flattenAndDeduplicate(apiMessages: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();

  function walk(msgs: any[]) {
    for (const msg of msgs) {
      const { replies, ...clean } = msg;
      if (!map.has(clean.id)) {
        map.set(clean.id, clean as ChatMessage);
      }
      if (Array.isArray(replies) && replies.length > 0) {
        walk(replies);
      }
    }
  }

  walk(apiMessages);

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(a.timestamp || a.created_at || '').getTime() -
      new Date(b.timestamp || b.created_at || '').getTime()
  );
}

export function useChat(simulationId: string | null, currentUserId?: string, sessionId?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const originalTitleRef = useRef<string>(document.title);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const lastSoundAtRef = useRef<number>(0);

  const playIncomingSound = useCallback(() => {
    const now = Date.now();
    if (now - lastSoundAtRef.current < 900) return;
    lastSoundAtRef.current = now;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
      window.setTimeout(() => audioContext.close().catch(() => undefined), 300);
    } catch {
      // Browsers can block audio before the first user gesture.
    }
  }, []);

  const getAuthorLabel = useCallback((msg: ChatMessage) => {
    const fullName = `${msg.author?.first_name || ''} ${msg.author?.last_name || ''}`.trim();
    const email = msg.user_email || msg.author?.email;
    return fullName || email?.split('@')[0] || 'New message';
  }, []);

  const notifyIncomingMessage = useCallback((msg: ChatMessage) => {
    const body = getMessageText(msg).slice(0, 120) || 'Sent an attachment';
    const title = `Message from ${getAuthorLabel(msg)}`;

    window.dispatchEvent(new CustomEvent('simulation-chat-message', {
      detail: { title, body, message: msg }
    }));

    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  }, [getAuthorLabel]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100);
  }, []);

  // Load messages - simulation-scoped
  const loadMessages = useCallback(async (loadOffset = 0, append = false) => {
    if (!simulationId) return;

    try {
      setLoadingMore(true);
      const response = sessionId
        ? await simulationAPI.getChatMessagesWithReplies(sessionId, { limit: 50, offset: loadOffset, filter: 'all' })
        : await simulationAPI.getChatMessagesWithRepliesBySimulation(
            simulationId,
            { limit: 50, offset: loadOffset, filter: 'all' }
          );

      if (response.success) {
        const apiMessages: ChatMessage[] = response.data?.messages || [];

        if (apiMessages.length > 0) {
          console.log('[DEBUG loadMessages] First message from API:', {
            id: apiMessages[0].id,
            message: apiMessages[0].message?.substring?.(0, 150),
          });
        }

        const flat = flattenAndDeduplicate(apiMessages);

        if (append) {
          setMessages(prev => {
            const merged = new Map<string, ChatMessage>();
            for (const m of [...flat, ...prev]) {
              if (!merged.has(m.id)) merged.set(m.id, m);
            }
            return Array.from(merged.values()).sort(
              (a, b) =>
                new Date(a.timestamp || a.created_at || '').getTime() -
                new Date(b.timestamp || b.created_at || '').getTime()
            );
          });
        } else {
          setMessages(flat);
          setTimeout(scrollToBottom, 200);
        }

        setOffset(loadOffset + apiMessages.length);
        setHasMore(apiMessages.length === 50);
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [simulationId, sessionId, scrollToBottom]);

  // Merge reload - simulation-scoped
  const loadMessagesMerge = useCallback(async () => {
    if (!simulationId) return;
    try {
      const response = sessionId
        ? await simulationAPI.getChatMessagesWithReplies(sessionId, { limit: 50, offset: 0, filter: 'all' })
        : await simulationAPI.getChatMessagesWithRepliesBySimulation(
            simulationId,
            { limit: 50, offset: 0, filter: 'all' }
          );
      if (response.success) {
        const apiMessages: ChatMessage[] = response.data?.messages || [];
        const flat = flattenAndDeduplicate(apiMessages);
        setMessages(prev => {
          const merged = new Map<string, ChatMessage>();
          for (const m of prev) merged.set(m.id, m);
          for (const m of flat) merged.set(m.id, m);
          return Array.from(merged.values()).sort(
            (a, b) =>
              new Date(a.timestamp || a.created_at || '').getTime() -
              new Date(b.timestamp || b.created_at || '').getTime()
          );
        });
        setOffset(apiMessages.length);
        setHasMore(apiMessages.length === 50);
      }
    } catch (error) {
      console.error('Failed to merge messages:', error);
    }
  }, [simulationId, sessionId]);

  // ✅ MANUAL REFRESH - User clicks refresh button
  const manualRefresh = useCallback(async () => {
    if (!simulationId) return;
    setIsRefreshing(true);
    console.log('🔄 Manual chat refresh triggered by user');
    try {
      await loadMessagesMerge();
      console.log('✅ Chat refresh completed');
    } catch (error) {
      console.error('❌ Chat refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [simulationId, loadMessagesMerge]);

  const loadMoreMessages = useCallback(async () => {
    if (hasMore && !loadingMore) {
      const container = messagesEndRef.current?.parentElement;
      const scrollHeight = container?.scrollHeight || 0;

      await loadMessages(offset, true);

      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - scrollHeight;
        }
      }, 100);
    }
  }, [hasMore, loadingMore, offset, loadMessages]);

  // Send message - simulation-scoped
  const sendMessage = useCallback(async (
    text: string,
    attachments: ChatAttachment[] = [],
    replyToId?: string | null
  ) => {
    if (!simulationId) return;
    if (!text.trim() && attachments.length === 0) return;

    try {
      const cleanAttachments = attachments.map(a => ({
        name: a.name,
        size: a.size,
        type: a.type,
        dataUrl: a.dataUrl,
      }));

      const sendResult = await simulationAPI.sendChatMessageBySimulation(
        simulationId,
        text.trim(),
        cleanAttachments,
        replyToId || null,
        sessionId || null
      );

      if (replyToId && socketRef.current?.connected) {
        socketRef.current.emit('chat_message_replied', { replyToId, simulationId });
      }

      setReplyingTo(null);

      const saved: ChatMessage | null = sendResult?.data ?? null;
      if (saved?.id) {
        const { replies: _, ...clean } = saved as any;
        setMessages(prev => {
          if (prev.some(m => m.id === clean.id)) return prev;
          return [...prev, clean as ChatMessage].sort(
            (a, b) =>
              new Date(a.timestamp || a.created_at || '').getTime() -
              new Date(b.timestamp || b.created_at || '').getTime()
          );
        });
      }

      await loadMessagesMerge();
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, [simulationId, sessionId, loadMessagesMerge, scrollToBottom]);

  // Edit message - simulation-scoped
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!simulationId) return;

    const originalMsg = messages.find(m => m.id === messageId);
    const parsed = parseChatMessage(originalMsg?.message || '');
    const newMessageData = { text: newContent, attachments: parsed.attachments };
    const newMessageString = JSON.stringify(newMessageData);

    try {
      await simulationAPI.editChatMessageBySimulation(simulationId, messageId, newMessageString);
      
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, message: newMessageString } : m)
      );

      if (socketRef.current?.connected) {
        socketRef.current.emit('chat_message_edited', {
          messageId,
          message: newMessageString,
          simulationId,
        });
      }

      setEditingMessage(null);
      setEditContent('');
    } catch (error: any) {
      console.error('Failed to edit message:', error);
      
      const errorMessage = error?.message || 'Failed to edit message';
      const statusCode = error?.status || error?.response?.status;
      
      if (statusCode === 404) {
        alert('Message not found. It may have been deleted.');
      } else if (statusCode === 403) {
        alert('You do not have permission to edit this message.');
      } else {
        alert(errorMessage);
      }
      
      await loadMessagesMerge();
      throw error;
    }
  }, [simulationId, messages, loadMessagesMerge]);

  const saveEdit = useCallback(async () => {
    if (editingMessage) {
      await editMessage(editingMessage.id, editContent);
    }
  }, [editingMessage, editContent, editMessage]);

  // Delete message - simulation-scoped
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!simulationId) return;

    try {
      await simulationAPI.deleteChatMessageBySimulation(simulationId, messageId);

      setMessages(prev => prev.filter(m => m.id !== messageId));
      setDeletingMessage(null);

      if (socketRef.current?.connected) {
        socketRef.current.emit('chat_message_deleted', { messageId, simulationId });
      }

      if (replyingTo?.id === messageId) setReplyingTo(null);
      if (editingMessage?.id === messageId) {
        setEditingMessage(null);
        setEditContent('');
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
      throw error;
    }
  }, [simulationId, replyingTo, editingMessage]);

  const startEdit = useCallback((message: ChatMessage) => {
    setEditingMessage(message);
    setEditContent(getMessageText(message));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setEditContent('');
  }, []);

  const startReply = useCallback((message: ChatMessage) => {
    setReplyingTo(message);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Mark as read - simulation-scoped
  const markAsRead = useCallback(async (messageIds?: string[]) => {
    if (!simulationId) return;
    try {
      await simulationAPI.markMessagesAsReadBySimulation(simulationId, messageIds);
      setUnreadCount(0);
      document.title = originalTitleRef.current;
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [simulationId]);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && messages.length > 0) {
      scrollToBottom();
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // WebSocket - uses simulationId
  useEffect(() => {
    if (!simulationId) return;
    let isMounted = true;

    const socket = io(SOCKET_BASE_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!isMounted) return;
      setSocketConnected(true);
      socket.emit('join_simulation', simulationId);
      if (sessionId) socket.emit('join_session', sessionId);
      if (currentUserId) socket.emit('join_user', currentUserId);
    });

    socket.on('disconnect', () => {
      if (isMounted) setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      if (isMounted) setSocketConnected(false);
    });

    socket.on('simulation_chat_message', (newMsg: ChatMessage) => {
      if (!isMounted) return;
      const isRelevant =
        newMsg.session_id === sessionId ||
        newMsg.simulation_id === simulationId ||
        newMsg.recipient_id === currentUserId ||
        newMsg.user_id === currentUserId;

      if (!isRelevant) return;

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        const { replies: _, ...clean } = newMsg as any;
        return [...prev, clean as ChatMessage].sort(
          (a, b) =>
            new Date(a.timestamp || a.created_at || '').getTime() -
            new Date(b.timestamp || b.created_at || '').getTime()
        );
      });
      const isOwn = newMsg.user_id === currentUserId || newMsg.author?.id === currentUserId;
      if (!isOwn) {
        setUnreadCount(prev => prev + 1);
        playIncomingSound();
        notifyIncomingMessage(newMsg);
      }
      scrollToBottom();
    });

    socket.on('unread_count_update', (payload: { simulation_id?: string; unread_count?: number }) => {
      if (!isMounted) return;
      if (!payload?.simulation_id || payload.simulation_id === simulationId) {
        setUnreadCount(Number(payload?.unread_count || 0));
      }
    });

    socket.on('message_edited', (editedMsg: ChatMessage) => {
      if (!isMounted) return;
      setMessages(prev =>
        prev.map(m => m.id === editedMsg.id ? { ...m, message: editedMsg.message } : m)
      );
    });

    socket.on('message_deleted', (deletedMsgId: string) => {
      if (!isMounted) return;
      setMessages(prev => prev.filter(m => m.id !== deletedMsgId));
      setDeletingMessage(null);
    });

    socket.on('message_replied', (repliedMsg: ChatMessage) => {
      if (!isMounted) return;
      setMessages(prev => {
        if (prev.some(m => m.id === repliedMsg.id)) return prev;
        const { replies: _, ...clean } = repliedMsg as any;
        return [...prev, clean as ChatMessage].sort(
          (a, b) =>
            new Date(a.timestamp || a.created_at || '').getTime() -
            new Date(b.timestamp || b.created_at || '').getTime()
        );
      });
      scrollToBottom();
    });

    return () => {
      isMounted = false;
      if (socket.connected) socket.emit('leave_simulation', simulationId);
      if (socket.connected && sessionId) socket.emit('leave_session', sessionId);
      if (socket.connected && currentUserId) socket.emit('leave_user', currentUserId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [simulationId, sessionId, currentUserId, notifyIncomingMessage, playIncomingSound, scrollToBottom]);

  // Initial load
  useEffect(() => {
    if (simulationId) loadMessages(0, false);
  }, [simulationId, loadMessages]);

  // ❌ REMOVED AUTO-REFRESH INTERVAL - No more automatic polling!
  // The useEffect below has been removed to stop automatic API calls
  /*
  useEffect(() => {
    if (!simulationId) return;
    const interval = window.setInterval(() => {
      loadMessagesMerge();
    }, socketConnected ? 8000 : 3000);
    return () => window.clearInterval(interval);
  }, [simulationId, socketConnected, loadMessagesMerge]);
  */

  return {
    messages,
    unreadCount,
    socketConnected,
    replyingTo,
    setReplyingTo: startReply,
    cancelReply,
    editingMessage,
    setEditingMessage,
    editContent,
    setEditContent,
    saveEdit,
    cancelEdit,
    deleteMessage,
    hasMore,
    loadingMore,
    loadMoreMessages,
    sendMessage,
    editMessage,
    startEdit,
    startReply,
    markAsRead,
    scrollToBottom,
    messagesEndRef,
    manualRefresh,      // 👈 Manual refresh function
    isRefreshing,       // 👈 Loading state for refresh button
  };
}