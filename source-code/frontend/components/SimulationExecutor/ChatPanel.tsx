// ChatPanel.tsx - Fixed edit, reply, delete
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, Send, Upload, Mic, X, FileText, Image,
  Reply, Edit3, Trash2, Check
} from 'lucide-react';
import ChatMessage from './ChatMessage';
import { ChatMessage as ChatMessageType, ChatAttachment, getMessageText } from './hooks/useChat';

interface ChatPanelProps {
  messages: ChatMessageType[];
  unreadCount: number;
  socketConnected: boolean;
  replyingTo: ChatMessageType | null;
  onReplyCancel: () => void;
  onStartReply: (message: ChatMessageType) => void;
  onSendMessage: (text: string, attachments: ChatAttachment[], replyToId?: string | null) => Promise<void>;
  onLoadMore: () => void;
  hasMoreMessages: boolean;
  editingMessage: ChatMessageType | null;
  editContent: string;
  onEditChange: (content: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: ChatMessageType) => void;
  onDeleteMessage: (messageId: string) => void;
  onFocusMessages?: () => void;
  currentUserId?: string;
  currentUserEmail?: string;
  isSessionClosed?: boolean;
}

const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_CHAT_ATTACHMENTS = 5;

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  unreadCount,
  socketConnected,
  replyingTo,
  onReplyCancel,
  onStartReply,
  onSendMessage,
  onLoadMore,
  hasMoreMessages,
  editingMessage,
  editContent,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDeleteMessage,
  onFocusMessages,
  currentUserId,
  currentUserEmail,
  isSessionClosed = false,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [fileError, setFileError] = useState('');
  const [sendError, setSendError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth'}), 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Re-focus message input after cancelling edit or reply
  useEffect(() => {
    if (!editingMessage) {
      setTimeout(() => messageInputRef.current?.focus(), 50);
    }
  }, [editingMessage]);

  const handleSend = async () => {
    if (!newMessage.trim() && attachments.length === 0) return;
    if (isSessionClosed) {
      setSendError('This session has ended   messaging is closed.');
      return;
    }
    try {
      setSendError('');
      await onSendMessage(newMessage, attachments, replyingTo?.id ?? null);
      setNewMessage('');
      setAttachments([]);
      onReplyCancel();
      scrollToBottom();
    } catch (error: any) {
      const message = error?.message || '';
      setSendError(
        /completed session/i.test(message)
          ? 'This session has ended   messaging is closed.'
          : 'Failed to send message. Please try again.'
      );
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    setFileError('');
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
      'video/mp4', 'video/webm', 'video/ogg',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const newAttachments: ChatAttachment[] = [];
    let hasError = false;

    for (const file of Array.from(files)) {
      if (attachments.length + newAttachments.length >= MAX_CHAT_ATTACHMENTS) {
        setFileError(`Maximum ${MAX_CHAT_ATTACHMENTS} attachments allowed`);
        break;
      }
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        setFileError(`${file.name} exceeds ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}`);
        hasError = true;
        continue;
      }
      if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
        setFileError(`${file.name}: unsupported file type`);
        hasError = true;
        continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(file.name));
          reader.readAsDataURL(file);
        });
        newAttachments.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
        });
      } catch {
        setFileError(`Failed to process ${file.name}`);
        hasError = true;
      }
    }

    if (!hasError && newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments].slice(0, MAX_CHAT_ATTACHMENTS));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav'});
        const file = new File([blob], `voice-${Date.now()}.wav`, { type: 'audio/wav'});
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments(prev => [...prev, {
            id: `voice-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: reader.result as string,
          }]);
        };
        reader.readAsDataURL(file);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMoreMessages) return;
    setLoadingMore(true);
    await onLoadMore();
    setLoadingMore(false);
  };

  const handleDeleteClick = (messageId: string) => {
    setShowDeleteConfirm(messageId);
  };

  const confirmDelete = async (messageId: string) => {
    setShowDeleteConfirm(null);
    await onDeleteMessage(messageId);
  };

  // ─── Reply banner (stable, not an inner component) ─────────────────────────
  const replyBanner = replyingTo ? (() => {
    const text = getMessageText(replyingTo);
    const authorName =
      replyingTo.author?.first_name ||
      replyingTo.user_email?.split('@')[0] ||
      'User';
    return (
      <div className="bg-blue-900/30 rounded px-3 py-2 border-l-4 border-blue-500 flex-shrink-0 mx-3 mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-blue-400 font-medium flex items-center gap-1">
            <Reply size={10} /> Replying to <span className="font-semibold ml-1">{authorName}</span>
          </span>
          <button onClick={onReplyCancel} className="text-gray-400 hover:text-white p-0.5">
            <X size={12} />
          </button>
        </div>
        <p className="text-xs text-gray-300 line-clamp-2 break-words pl-1">
          {text.substring(0, 120)}{text.length > 120 ? '…': ''}
        </p>
      </div>
    );
  })() : null;

  // ─── Edit banner (stable, not an inner component) ──────────────────────────
  // NOTE: The actual edit textarea lives inside <ChatMessage> when isEditing.
  // This banner just shows which message is being edited and lets the user cancel.
  const editBanner = editingMessage ? (() => {
    const originalText = getMessageText(editingMessage);
    return (
      <div className="bg-yellow-900/30 rounded px-3 py-2 border-l-4 border-yellow-500 flex-shrink-0 mx-3 mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-yellow-400 font-medium flex items-center gap-1">
            <Edit3 size={10} /> Editing message
          </span>
          <button onClick={onCancelEdit} className="text-gray-400 hover:text-white p-0.5">
            <X size={12} />
          </button>
        </div>
        <p className="text-xs text-gray-400 line-clamp-2 break-words pl-1">
          {originalText.substring(0, 100)}{originalText.length > 100 ? '…': ''}
        </p>
      </div>
    );
  })() : null;

  return (
    <div className="w-full h-full bg-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <MessageCircle size={15} className="text-blue-400" /> Chat
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-1 animate-pulse">
              {unreadCount}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse': 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">{socketConnected ? 'Live': 'Offline'}</span>
        </div>
      </div>

      {/* Message list   threaded: replies rendered indented under their parent */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col"
        tabIndex={0}
        onFocus={() => onFocusMessages?.()}
        onClick={() => onFocusMessages?.()}
      >
        {hasMoreMessages && (
          <div className="text-center mb-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…': '↑ Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
            <MessageCircle size={28} className="mb-2 opacity-40" />
            <p className="text-xs">No messages yet</p>
            <p className="text-xs text-gray-700">Start the conversation!</p>
          </div>
        )}

        {/* Build thread view: top-level messages first, replies (including reply-to-reply) grouped by thread_id */}
        <div className="space-y-1 mt-auto">
          {(() => {
            // A message belongs to a thread if it has reply_to set.
            // Use thread_id (root of thread) as the grouping key.
            // Fall back to reply_to for legacy messages without thread_id.
            const topLevel = messages.filter(m => !m.reply_to);
            const repliesByThread = new Map<string, typeof messages>();
            for (const m of messages) {
              if (m.reply_to) {
                // thread_id always points to the root message; use it if present
                const threadRoot = m.thread_id ?? m.reply_to;
                const bucket = repliesByThread.get(threadRoot) ?? [];
                bucket.push(m);
                repliesByThread.set(threadRoot, bucket);
              }
            }

            const msgProps = (msg: (typeof messages)[0]) => ({
              message: msg,
              allMessages: messages,
              currentUserId,
              currentUserEmail,
              editingId: editingMessage?.id ?? null,
              editContent,
              onEditChange,
              onSaveEdit,
              onCancelEdit,
              onStartEdit,
              onStartReply,
              onDelete: (m: (typeof messages)[0]) => handleDeleteClick(m.id),
            });

            return topLevel.map(msg => (
              <div key={msg.id}>
                <ChatMessage {...msgProps(msg)} />
                {/* All replies in this thread, sorted oldest-first, indented */}
                {(repliesByThread.get(msg.id) ?? [])
                  .slice()
                  .sort((a, b) =>
                    new Date(a.timestamp || a.created_at || '').getTime() -
                    new Date(b.timestamp || b.created_at || '').getTime()
                  )
                  .map(reply => (
                    <div key={reply.id} className="ml-4 pl-2 border-l-2 border-blue-800/50 mt-1">
                      <ChatMessage {...msgProps(reply)} />
                    </div>
                  ))}
              </div>
            ));
          })()}
        </div>
        <div ref={chatEndRef} />
      </div>

      {/* Banners sit above the input, rendered as stable JSX not inner components */}
      {editBanner}
      {replyBanner}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="px-3 space-y-1 max-h-24 overflow-y-auto flex-shrink-0">
          {attachments.map(file => (
            <div key={file.id} className="flex items-center bg-gray-700 rounded px-2 py-1 text-xs gap-1.5">
              {file.type.startsWith('audio/') ? (
                <Mic size={10} className="text-green-400 flex-shrink-0" />
              ) : file.type.startsWith('image/') ? (
                <Image size={10} className="text-blue-400 flex-shrink-0" />
              ) : (
                <FileText size={10} className="text-gray-400 flex-shrink-0" />
              )}
              <span className="truncate text-gray-300 flex-1">{file.name}</span>
              <span className="text-gray-500 text-xs">{formatBytes(file.size)}</span>
              <button
                onClick={() => setAttachments(prev => prev.filter(a => a.id !== file.id))}
                className="text-red-500 hover:text-red-400"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {fileError && (
        <p className="text-xs text-red-400 px-3 flex-shrink-0">{fileError}</p>
      )}

      {/* Input area   hidden while editing (edit happens inline in ChatMessage) */}
      {!editingMessage && (
        <div className="border-t border-gray-700 p-3 space-y-2 flex-shrink-0">
          {isSessionClosed ? (
            <p className="text-sm text-gray-400 text-center py-2">
              This session has ended   messaging is closed.
            </p>
          ) : (
            <>
              {sendError && (
                <p className="text-xs text-red-400">{sendError}</p>
              )}
              <div className="flex gap-1.5">
                <textarea
                  ref={messageInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter'&& !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    replyingTo
                      ? `Reply to ${replyingTo.author?.first_name || replyingTo.user_email?.split('@')[0] || 'User'}…`
                      : 'Type a message… (Enter to send)'
                  }
                  className="flex-1 px-3 py-2 bg-gray-700 text-white text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 resize-none"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() && attachments.length === 0}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 self-end flex items-center gap-1"
                >
                  <Send size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 cursor-pointer text-xs">
                  <Upload size={12} />
                  <span>Attach</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.csv"
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                </label>

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors ${
                    isRecording
                      ? 'bg-red-600 text-white animate-pulse hover:bg-red-700'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <Mic size={12} />
                  {isRecording
                    ? `${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, '0')} Stop`
                    : 'Voice'}
                </button>

                <span className={`ml-auto text-xs ${attachments.length === MAX_CHAT_ATTACHMENTS ? 'text-yellow-500': 'text-gray-600'}`}>
                  {attachments.length}/{MAX_CHAT_ATTACHMENTS}
                </span>

                {socketConnected && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation   rendered at document body level via portal-style fixed overlay */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.75)'}}
        >
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-sm w-full p-6 border border-gray-600 text-center">
            <Trash2 className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Delete Message?</h3>
            <p className="text-gray-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
