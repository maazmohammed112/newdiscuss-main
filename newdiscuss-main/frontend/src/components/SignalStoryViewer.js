import {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  markStorySeen,
  deleteStory,
  subscribeToStoryViews,
} from '@/lib/storiesDb';
import { parseTextWithLinks } from '@/components/LinkifiedText';
import {
  X,
  MoreVertical,
  Trash2,
  User,
  Pause,
  Eye,
  Zap,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';

const STORY_DURATION_MS = 8000;

// ─── Extract first URL from text ─────────────────────────────
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match) return null;
  const raw = match[0];
  return raw.startsWith('www.') ? `https://${raw}` : raw;
}

// ─── URL Preview Card (Open Graph via microlink.io) ──────────
function StoryUrlPreview({ url }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    // Check sessionStorage cache first — instant on repeat views
    const CACHE_KEY = `sig_og_${url}`;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setMeta(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {}

    setLoading(true);
    setFailed(false);
    setMeta(null);

    const fetchMeta = async () => {
      try {
        const res = await fetch(
          `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.status === 'success') {
          const result = {
            title: data.data.title || '',
            description: data.data.description || '',
            image: data.data.image?.url || null,
            siteName: data.data.publisher || '',
            domain: (() => {
              try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
            })(),
          };
          // Cache result for this session
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
          setMeta(result);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMeta();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div
        className="mt-4 rounded-[10px] overflow-hidden animate-pulse"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(168,85,247,0.2)',
          height: '70px',
        }}
      />
    );
  }

  if (failed || !meta) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'block',
        marginTop: '16px',
        borderRadius: '10px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(168,85,247,0.2)',
        textDecoration: 'none',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    >
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Thumbnail */}
        {meta.image && (
          <div
            style={{
              width: '80px',
              flexShrink: 0,
              background: '#1a0a2e',
              overflow: 'hidden',
            }}
          >
            <img referrerPolicy="no-referrer" crossOrigin="anonymous" src={meta.image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}
        {/* Text meta */}
        <div style={{ padding: '10px 12px', flex: 1, minWidth: 0 }}>
          {/* Domain */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
            <Globe style={{ width: '10px', height: '10px', color: 'rgba(168,85,247,0.8)', flexShrink: 0 }} />
            <span style={{
              fontSize: '10px',
              color: 'rgba(168,85,247,0.8)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}>
              {meta.siteName || meta.domain}
            </span>
          </div>
          {/* Title */}
          {meta.title && (
            <p style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 1.3,
              marginBottom: '3px',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {meta.title}
            </p>
          )}
          {/* Description */}
          {meta.description && (
            <p style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.4,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}>
              {meta.description}
            </p>
          )}
        </div>
        {/* External icon */}
        <div style={{ padding: '10px 10px 0 0', flexShrink: 0 }}>
          <ExternalLink style={{ width: '12px', height: '12px', color: 'rgba(168,85,247,0.6)' }} />
        </div>
      </div>
    </a>
  );
}


// ─── Relative time helper ────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── Per-story view counter (owner only) ─────────────────────
function StoryViewCount({ storyId, isOwner }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!isOwner) return;
    const unsub = subscribeToStoryViews(storyId, setCount);
    return () => unsub();
  }, [storyId, isOwner]);

  if (!isOwner || count === null) return null;

  return (
    <div className="flex items-center gap-1 text-white/70 text-[11px]">
      <Eye className="w-3 h-3" />
      <span>{count}</span>
    </div>
  );
}

// ─── Main Viewer ─────────────────────────────────────────────
/**
 * SignalStoryViewer
 * Props:
 *   groups        — array from groupStoriesByAuthor()
 *   initialGroupIndex — which group to open first
 *   seenIds       — Set<string> of seen story ids
 *   onSeenUpdate  — (id) => void  called after marking seen
 *   onClose       — () => void
 */
function SignalStoryViewer({
  groups,
  initialGroupIndex = 0,
  seenIds,
  onSeenUpdate,
  onClose,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0–100
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const progressRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedRef = useRef(0); // ms elapsed before a pause
  const rafRef = useRef(null);
  const holdTimerRef = useRef(null);

  const currentGroup = groups[groupIdx];
  const currentStory = currentGroup?.stories[storyIdx];
  const isOwner = currentStory?.authorId === user?.id;

  // ── navigation helpers ──────────────────────────────────────
  const goNext = useCallback(() => {
    const group = groups[groupIdx];
    if (!group) return;

    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [groupIdx, groups, onClose, storyIdx]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx((g) => g - 1);
      setStoryIdx(0);
    }
  }, [groupIdx, storyIdx]);

  // ── mark seen ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentStory || !user?.id) return;
    if (!seenIds.has(currentStory.id)) {
      markStorySeen(currentStory.id, user.id).then(() => {
        onSeenUpdate?.(currentStory.id);
      });
    }
    // reset progress + elapsed when story changes
    setProgress(0);
    elapsedRef.current = 0;
    startTimeRef.current = null;
    setMenuOpen(false);
    setConfirmDelete(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id]);

  // ── progress animation ──────────────────────────────────────
  useEffect(() => {
    if (paused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (now) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = elapsedRef.current + (now - startTimeRef.current);
      const pct = Math.min((elapsed / STORY_DURATION_MS) * 100, 100);
      setProgress(pct);

      if (elapsed >= STORY_DURATION_MS) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      // When pausing, snapshot elapsed
      if (startTimeRef.current) {
        elapsedRef.current += performance.now() - startTimeRef.current;
        startTimeRef.current = null;
      }
    };
  }, [paused, currentStory?.id, goNext]);

  // ── keyboard nav ───────────────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [goNext, goPrev, onClose]);

  // ── press-and-hold pause ───────────────────────────────────
  const handlePointerDown = () => {
    holdTimerRef.current = setTimeout(() => setPaused(true), 100);
  };
  const handlePointerUp = () => {
    clearTimeout(holdTimerRef.current);
    setPaused(false);
  };

  // ── delete story ────────────────────────────────────────────
  const handleDelete = async () => {
    if (!isOwner || !currentStory) return;
    setDeleting(true);
    try {
      await deleteStory(currentStory.id);
      toast.success('Story deleted');
      // Move to next; if none, close
      const group = groups[groupIdx];
      if (group.stories.length > 1) {
        goNext();
      } else if (groups.length > 1) {
        const newGroupIdx = groupIdx > 0 ? groupIdx - 1 : groupIdx + 1;
        setGroupIdx(newGroupIdx);
        setStoryIdx(0);
      } else {
        onClose();
      }
    } catch {
      toast.error('Failed to delete story');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
      setMenuOpen(false);
    }
  };

  if (!currentGroup || !currentStory) return null;

  const parts = parseTextWithLinks(currentStory.text);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
    >
      {/* Main card */}
      <div
        className="relative w-full max-w-sm mx-auto flex flex-col"
        style={{
          height: '90dvh',
          maxHeight: '700px',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'linear-gradient(160deg,#0f0f1a 0%,#1a0a2e 50%,#0a1628 100%)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(168,85,247,0.15)',
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3 pt-4">
          {currentGroup.stories.map((s, i) => (
            <div
              key={s.id}
              className="flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.25)' }}
            >
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width:
                    i < storyIdx
                      ? '100%'
                      : i === storyIdx
                      ? `${progress}%`
                      : '0%',
                  background:
                    'linear-gradient(90deg,#a855f7,#ec4899)',
                  transition: i === storyIdx ? 'none' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Top bar: author + controls */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-10 px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Author avatar */}
            {currentGroup.authorPhotoUrl ? (
              <img referrerPolicy="no-referrer" crossOrigin="anonymous" src={currentGroup.authorPhotoUrl}
                alt={currentGroup.authorUsername}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-purple-400/60"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-purple-400/60"
                style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}
              >
                {(currentGroup.authorUsername?.[0] || 'U').toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white text-[13px] font-semibold leading-tight">
                {currentGroup.authorUsername}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-white/60 text-[11px]">
                  {relativeTime(currentStory.createdAt)}
                </p>
                <StoryViewCount
                  storyId={currentStory.id}
                  isOwner={isOwner}
                />
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Pause indicator */}
            {paused && (
              <div className="bg-white/20 rounded-full p-1.5">
                <Pause className="w-3.5 h-3.5 text-white" />
              </div>
            )}

            {/* Three-dot menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                  setPaused((v) => !v);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-9 w-48 rounded-[10px] py-1 overflow-hidden z-20"
                  style={{
                    background: 'rgba(20,10,40,0.95)',
                    border: '1px solid rgba(168,85,247,0.25)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* View profile */}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setPaused(false);
                      navigate(`/user/${currentGroup.authorId}`);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/80 hover:text-white hover:bg-white/10 transition-all text-left"
                  >
                    <User className="w-4 h-4" />
                    View Profile
                  </button>

                  {/* Delete — owner only */}
                  {isOwner && (
                    <>
                      <div className="mx-3 border-t border-white/10 my-1" />
                      {confirmDelete ? (
                        <div className="px-4 py-2">
                          <p className="text-[11px] text-white/60 mb-2">
                            Delete this story?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              className="flex-1 text-[12px] font-semibold text-white bg-red-500/80 hover:bg-red-500 rounded-[6px] py-1.5 transition-all"
                            >
                              {deleting ? '…' : 'Delete'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              className="flex-1 text-[12px] font-semibold text-white/70 bg-white/10 hover:bg-white/20 rounded-[6px] py-1.5 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all text-left"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Story
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* X close */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Story content — text is non-selectable; only links are interactive */}
        <div className="flex-1 flex flex-col justify-center px-6 py-4 pt-24 pb-16 overflow-y-auto scrollbar-hide">
          {/* Text with whitespace exactly as typed */}
          <div
            className="w-full text-white text-[17px] leading-relaxed font-medium break-words"
            style={{
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {parts.map((part, index) => {
              if (part.type === 'link') {
                return (
                  <a
                    key={index}
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="underline decoration-purple-400/60 hover:decoration-purple-300 text-purple-300 hover:text-purple-200 transition-colors"
                    style={{ userSelect: 'auto', WebkitUserSelect: 'auto' }}
                    title={part.content}
                  >
                    {part.content}
                  </a>
                );
              }
              return <span key={index}>{part.content}</span>;
            })}
          </div>

          {/* URL Preview Card — only if a URL exists in the story */}
          {(() => {
            const firstUrl = extractFirstUrl(currentStory.text);
            if (!firstUrl) return null;
            return (
              <StoryUrlPreview
                key={currentStory.id + firstUrl}
                url={firstUrl}
              />
            );
          })()}
        </div>

        {/* Signal badge */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(168,85,247,0.15)',
              border: '1px solid rgba(168,85,247,0.25)',
            }}
          >
            <Zap className="w-3 h-3 text-purple-400 fill-purple-400" />
            <span className="text-purple-300/80 text-[11px] font-semibold tracking-wide uppercase">
              Signal
            </span>
          </div>
        </div>

        {/* Left/right tap zones */}
        <button
          className="absolute left-0 top-0 h-full w-1/3 z-[5]"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Previous story"
        />
        <button
          className="absolute right-0 top-0 h-full w-1/3 z-[5]"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Next story"
        />
      </div>

      {/* Group navigation arrows (outside card) */}
      {groupIdx > 0 && (
        <button
          className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full text-white/70 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setGroupIdx((g) => g - 1); setStoryIdx(0); }}
          aria-label="Previous user"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {groupIdx < groups.length - 1 && (
        <button
          className="absolute right-4 flex items-center justify-center w-10 h-10 rounded-full text-white/70 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setGroupIdx((g) => g + 1); setStoryIdx(0); }}
          aria-label="Next user"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default memo(SignalStoryViewer);
