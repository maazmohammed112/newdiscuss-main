import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToActiveStories,
  getSeenStoryIds,
  groupStoriesByAuthor,
} from '@/lib/storiesDb';
import SignalStoryCreator from '@/components/SignalStoryCreator';
import SignalStoryViewer from '@/components/SignalStoryViewer';
import { Plus, Zap } from 'lucide-react';

// ─── Avatar circle for each user in the row ──────────────────
function StoryAvatar({ group, hasUnseen, isSelf, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group focus:outline-none"
      style={{ width: '66px' }}
    >
      {/* Ring + avatar */}
      <div className="relative">
        {/* Gradient ring */}
        <div
          className="w-[58px] h-[58px] rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
          style={
            hasUnseen
              ? {
                  background:
                    'linear-gradient(135deg, #a855f7, #ec4899, #f97316)',
                  padding: '2.5px',
                }
              : {
                  background: 'rgba(128,128,128,0.25)',
                  padding: '2.5px',
                }
          }
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#2a2a2a]">
            {group.authorPhotoUrl ? (
              <img
                src={group.authorPhotoUrl}
                alt={group.authorUsername}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-[18px] font-bold"
                style={{
                  background: hasUnseen
                    ? 'linear-gradient(135deg,#a855f7,#ec4899)'
                    : 'linear-gradient(135deg,#6b7280,#9ca3af)',
                }}
              >
                {(group.authorUsername?.[0] || 'U').toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* "You" indicator dot */}
        {isSelf && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', border: '2px solid #fff' }}
          >
            <Zap className="w-2 h-2 text-white fill-white" />
          </div>
        )}
      </div>

      {/* Username label */}
      <span
        className="text-[11px] leading-tight text-center truncate w-full font-medium"
        style={{ maxWidth: '64px' }}
      >
        <span className="text-neutral-700 dark:text-neutral-300 discuss:text-[#9CA3AF]">
          {isSelf ? 'You' : group.authorUsername}
        </span>
      </span>
    </button>
  );
}

// ─── Add Story Button (first item) ───────────────────────────
function AddStoryButton({ hasOwnStory, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group focus:outline-none"
      style={{ width: '66px' }}
    >
      <div className="relative">
        {/* Outer dashed ring */}
        <div
          className="w-[58px] h-[58px] rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#a855f7,#ec4899)',
            padding: '2px',
          }}
        >
          <div className="w-full h-full rounded-full bg-white dark:bg-neutral-900 discuss:bg-[#1a1a1a] flex items-center justify-center">
            <Plus
              className="w-5 h-5 text-purple-500"
              strokeWidth={2.5}
            />
          </div>
        </div>
      </div>
      <span className="text-[11px] leading-tight text-center font-medium text-neutral-700 dark:text-neutral-300 discuss:text-[#9CA3AF]">
        {hasOwnStory ? 'Add more' : 'Add'}
      </span>
    </button>
  );
}

// ─── Main Row Component ───────────────────────────────────────
export default function SignalStoriesRow() {
  const { user } = useAuth();

  const [stories, setStories] = useState([]);
  const [seenIds, setSeenIds] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [loadingSeenIds, setLoadingSeenIds] = useState(true);

  const [showCreator, setShowCreator] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState(0);

  const rowRef = useRef(null);

  // ── load seen ids once ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    getSeenStoryIds(user.id).then((ids) => {
      setSeenIds(ids);
      setLoadingSeenIds(false);
    });
  }, [user?.id]);

  // ── subscribe to active stories ─────────────────────────────
  useEffect(() => {
    const unsub = subscribeToActiveStories((fresh) => {
      setStories(fresh);
    });
    return () => unsub();
  }, []);

  // ── re-group whenever stories or seenIds change ─────────────
  useEffect(() => {
    const g = groupStoriesByAuthor(stories, seenIds, user?.id);
    setGroups(g);
  }, [stories, seenIds, user?.id]);

  const handleSeenUpdate = useCallback((storyId) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(storyId);
      return next;
    });
  }, []);

  const openViewer = (groupIdx) => {
    setViewerGroupIdx(groupIdx);
    setViewerOpen(true);
  };

  // Hide row if no stories and don't show loading skeleton to avoid layout shift
  const hasStories = groups.length > 0;

  return (
    <>
      {/* ── Stories Row ─────────────────────────────────────── */}
      <div className="mb-4">
        {/* Row header */}
        <div className="flex items-center gap-1.5 mb-3">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}
          >
            <Zap className="w-2.5 h-2.5 text-white fill-white" />
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]">
            Signal
          </span>
        </div>

        {/* Scrollable strip */}
        <div
          ref={rowRef}
          className="flex items-start gap-3 overflow-x-auto scrollbar-hide pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* + Add button (always first) */}
          <AddStoryButton
            hasOwnStory={groups.some((g) => g.authorId === user?.id)}
            onClick={() => setShowCreator(true)}
          />

          {/* Story avatars */}
          {!loadingSeenIds &&
            groups.map((group, idx) => {
              const hasUnseen = group.stories.some(
                (s) => !seenIds.has(s.id)
              );
              return (
                <StoryAvatar
                  key={group.authorId}
                  group={group}
                  hasUnseen={hasUnseen}
                  isSelf={group.authorId === user?.id}
                  onClick={() => openViewer(idx)}
                />
              );
            })}

          {/* Placeholder circles while seenIds are loading */}
          {loadingSeenIds &&
            stories.length > 0 &&
            Array.from({ length: Math.min(stories.length, 5) }).map((_, i) => (
              <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5" style={{ width: '66px' }}>
                <div
                  className="w-[58px] h-[58px] rounded-full animate-pulse"
                  style={{ background: 'rgba(128,128,128,0.2)' }}
                />
                <div className="w-10 h-2 rounded-full animate-pulse" style={{ background: 'rgba(128,128,128,0.15)' }} />
              </div>
            ))}
        </div>
      </div>

      {/* ── Story Creator Modal ─────────────────────────────── */}
      {showCreator && (
        <SignalStoryCreator
          onClose={() => setShowCreator(false)}
          onCreated={() => setShowCreator(false)}
        />
      )}

      {/* ── Story Viewer ─────────────────────────────────────── */}
      {viewerOpen && groups.length > 0 && (
        <SignalStoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIdx}
          seenIds={seenIds}
          onSeenUpdate={handleSeenUpdate}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
