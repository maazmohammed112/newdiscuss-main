import UserAvatar from '@/components/UserAvatar';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createStory } from '@/lib/storiesDb';
import { X, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';


const MAX_CHARS = 350;

export default function SignalStoryCreator({ onClose, onCreated }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const remaining = MAX_CHARS - text.length;
  const isOverLimit = remaining < 0;
  const isEmpty = text.trim().length === 0;
  const canPost = !isEmpty && !isOverLimit && !submitting;

  const handleSubmit = async () => {
    if (!canPost || !user) return;
    setSubmitting(true);
    try {
      await createStory(
        user.id,
        user.username,
        user.photo_url || '',
        text.trim()
      );
      toast.success('Story posted!', { duration: 2000 });
      onCreated?.();
      onClose();
    } catch (err) {
      console.error('Story creation error:', err);
      toast.error('Failed to post story. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full sm:max-w-lg mx-auto bg-white dark:bg-neutral-900 discuss:bg-[#1a1a1a] rounded-t-[20px] sm:rounded-[20px] shadow-2xl overflow-hidden"
        style={{ minHeight: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            {/* Signal lightning icon */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #ec4899, #f97316)',
              }}
            >
              <Zap className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
              New Signal
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 discuss:hover:text-[#F5F5F5] hover:bg-neutral-100 dark:hover:bg-neutral-800 discuss:hover:bg-[#262626] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Author row */}
        <div className="flex items-center gap-2.5 px-5 pb-3">
          <UserAvatar
            src={user?.photo_url}
            username={user?.username}
            className="w-8 h-8 ring-2 ring-purple-400/40"
          />
          <div>
            <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100 discuss:text-[#F5F5F5]">
              {user?.username}
            </p>
            <p className="text-[11px] text-neutral-400 discuss:text-[#9CA3AF]">
              Visible to everyone · 24h
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-neutral-100 dark:border-neutral-800 discuss:border-[#2a2a2a]" />

        {/* Text input */}
        <div className="px-5 pt-4 pb-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's your signal? Share a thought, link, or update…"
            rows={6}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-600 discuss:placeholder:text-[#555] outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100 dark:border-neutral-800 discuss:border-[#2a2a2a]">
          {/* Char counter */}
          <div className="flex items-center gap-1.5">
            {isOverLimit && (
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            )}
            <span
              className={`text-[12px] font-medium tabular-nums transition-colors ${
                isOverLimit
                  ? 'text-red-500'
                  : remaining <= 50
                  ? 'text-amber-500'
                  : 'text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]'
              }`}
            >
              {remaining}
            </span>
          </div>

          {/* Post button */}
          <button
            onClick={handleSubmit}
            disabled={!canPost}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canPost
                ? 'linear-gradient(135deg, #a855f7, #ec4899)'
                : '#6b7280',
              boxShadow: canPost
                ? '0 4px 14px rgba(168,85,247,0.4)'
                : 'none',
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 fill-white" />
                Post Signal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
