// ChatMessage.tsx
import React, { useState, useRef, useEffect } from 'react';
import { User, Reply, Edit3, Trash2, Check, FileText, Image, Mic } from 'lucide-react';
import { ChatMessage as ChatMessageType, getMessageText, parseChatMessage } from './hooks/useChat';

interface ChatMessageProps {
  message: ChatMessageType;
  allMessages: ChatMessageType[];
  currentUserId?: string;
  currentUserEmail?: string;
  editingId: string | null;
  editContent: string;
  onEditChange: (content: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (msg: ChatMessageType) => void;
  onStartReply: (msg: ChatMessageType) => void;
  onDelete: (msg: ChatMessageType) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  allMessages,
  currentUserId,
  currentUserEmail,
  editingId,
  editContent,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onStartReply,
  onDelete,
}) => {
  const [showActions, setShowActions] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = editingId === message.id;
  const messageUserId = message.user_id || message.author?.id;
  const messageEmail = message.user_email || message.author?.email;
  const isMe =
    (!!currentUserId && messageUserId === currentUserId) ||
    (!!currentUserEmail && messageEmail === currentUserEmail);
  const text = getMessageText(message);

  // Parse attachments
  const parsed = parseChatMessage(message.message || '');
  const attachments: any[] = parsed.attachments || [];

  // Focus edit textarea when this message enters edit mode
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      const el = document.getElementById(`chat-msg-${message.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        editTextareaRef.current?.focus();
        editTextareaRef.current?.select();
      }, 80);
    }
  }, [isEditing, message.id]);

  const parentMsg = message.reply_to
    ? ((message.replied_to_message as ChatMessageType) ||
       allMessages.find(m => m.id === message.reply_to))
    : null;
  const parentText = parentMsg ? getMessageText(parentMsg) : '';
  const getAuthorName = (msg: ChatMessageType) => {
    const fullName = `${msg.author?.first_name || ''} ${msg.author?.last_name || ''}`.trim();
    const email = msg.user_email || msg.author?.email;
    if (fullName) return fullName;
    if (email) return email.split('@')[0];
    if (msg.author?.user_type === 'company_admin') return 'Company Admin';
    if (msg.author?.user_type === 'recruiter') return 'Recruiter';
    if (msg.author?.user_type === 'candidate') return 'Candidate';
    return 'User';
  };

  const parentAuthor = parentMsg ? getAuthorName(parentMsg) : '';

  const scrollToParent = () => {
    if (!message.reply_to) return;
    const el = document.getElementById(`chat-msg-${message.reply_to}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1', 'ring-offset-gray-900');
      setTimeout(() =>
        el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1', 'ring-offset-gray-900'),
        2000
      );
    }
  };

  const authorName = getAuthorName(message);

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveEdit();
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancelEdit();
  };

  // ── Attachment renderer ───────────────────────────────────────────────────
  const renderAttachments = (atts: any[]) => {
    if (!atts || atts.length === 0) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        {atts.map((att: any, i: number) => {
          if (att.type?.startsWith('image/')) {
            return (
              <img
                key={i}
                src={att.dataUrl}
                alt={att.name}
                className="max-w-[200px] max-h-[150px] rounded object-cover border border-gray-600 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(att.dataUrl, '_blank')}
                title={att.name}
              />
            );
          }
          if (att.type?.startsWith('audio/')) {
            return (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Mic size={10} className="text-green-400" />
                  {att.name}
                </span>
                <audio controls src={att.dataUrl} className="max-w-[220px] h-8" />
              </div>
            );
          }
          return (
            <a
              key={i}
              href={att.dataUrl}
              download={att.name}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 text-xs text-blue-300 hover:text-blue-200 transition-colors"
            >
              <FileText size={10} className="text-gray-400 flex-shrink-0" />
              <span className="truncate max-w-[150px]">{att.name}</span>
              <span className="text-gray-500 ml-1">
                {att.size ? `${(att.size / 1024).toFixed(0)}KB` : ''}
              </span>
            </a>
          );
        })}
      </div>
    );
  };

  // ✅ NEW: Determine alignment classes based on who sent the message
  const alignmentClasses = isMe 
    ? 'justify-end' // Your messages on the RIGHT
    : 'justify-start'; // Others' messages on the LEFT

  const bubbleClasses = isMe
    ? 'bg-blue-600 border border-blue-500 rounded-l-lg rounded-br-lg' // Your messages - blue on right
    : 'bg-gray-700 border border-gray-600 rounded-r-lg rounded-bl-lg'; // Others - gray on left

  const textColorClasses = isMe ? 'text-white' : 'text-gray-100';
  const timeColorClasses = isMe ? 'text-blue-200' : 'text-gray-400';

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={`flex ${alignmentClasses} mb-3 transition-all duration-200`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`max-w-[75%] ${bubbleClasses} overflow-hidden shadow-sm`}>
        {/* Parent message reference (if reply) */}
        {parentMsg && (
          <button
            onClick={scrollToParent}
            className={`w-full text-left mb-2 pb-2 border-b ${isMe ? 'border-blue-700' : 'border-gray-600'} hover:bg-white/5 rounded px-2 py-1.5 -mx-1 transition-colors`}
            title="Click to jump to original message"
          >
            <div className="flex items-center gap-1 mb-0.5">
              <Reply size={10} className="text-blue-400 flex-shrink-0" />
              <span className="text-xs text-blue-400 font-medium">{parentAuthor}</span>
              <span className={`text-xs ${isMe ? 'text-blue-300' : 'text-gray-500'} ml-auto`}>↑ jump</span>
            </div>
            <div className="text-xs text-gray-400 italic pl-2 border-l-2 border-blue-500 line-clamp-2 break-words">
              {parentText.substring(0, 120)}{parentText.length > 120 ? '…' : ''}
            </div>
          </button>
        )}

        {/* Message content */}
        <div className="p-2.5">
          {/* Header with author name and time */}
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className={`text-xs font-semibold flex items-center gap-1 ${isMe ? 'text-blue-200' : 'text-blue-300'}`}>
              <User size={10} />
              {authorName}
              {message.author?.user_type === 'recruiter' && (
                <span className="text-xs bg-purple-700 px-1.5 py-0.5 rounded ml-1">Recruiter</span>
              )}
              {message.author?.user_type === 'company_admin' && (
                <span className="text-xs bg-purple-700 px-1.5 py-0.5 rounded ml-1">Admin</span>
              )}
              {message.author?.user_type === 'candidate' && (
                <span className="text-xs bg-green-700 px-1.5 py-0.5 rounded ml-1">Candidate</span>
              )}
            </span>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${timeColorClasses}`}>
                {new Date(message.timestamp || message.created_at || '').toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>

              {/* Edit/Delete buttons - only for own messages, not while editing */}
              {isMe && !isEditing && showActions && (
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartEdit(message); }}
                    className="text-gray-400 hover:text-white p-0.5 transition-colors"
                    title="Edit"
                  >
                    <Edit3 size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(message); }}
                    className="text-red-400 hover:text-red-300 p-0.5 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Message body - inline edit or display */}
          {isEditing ? (
            <div className="space-y-1.5">
              <textarea
                ref={editTextareaRef}
                value={editContent}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSaveEdit();
                  }
                  if (e.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
                className="w-full text-sm bg-gray-900 text-white rounded px-2 py-1 border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                spellCheck
              />

              {/* Show attachments being preserved */}
              {attachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">Attachments (preserved):</p>
                  <div className="flex flex-wrap gap-1">
                    {attachments.map((att: any) => (
                      <div key={att.name} className="flex items-center gap-1 bg-gray-700 rounded px-2 py-1 text-xs">
                        {att.type?.startsWith('audio/') ? (
                          <Mic size={10} className="text-green-400" />
                        ) : att.type?.startsWith('image/') ? (
                          <Image size={10} className="text-blue-400" />
                        ) : (
                          <FileText size={10} className="text-gray-400" />
                        )}
                        <span className="text-gray-300 truncate max-w-[150px]">{att.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 flex items-center gap-1 transition-colors"
                >
                  <Check size={10} /> Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Text content */}
              {text && (
                <p className={`text-sm break-all whitespace-pre-wrap leading-relaxed ${textColorClasses}`}>
                  {text}
                </p>
              )}

              {/* Attachments */}
              {renderAttachments(attachments)}

              {/* Reply button */}
              <div className="mt-1.5">
                <button
                  onClick={() => onStartReply(message)}
                  className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <Reply size={10} /> Reply
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
