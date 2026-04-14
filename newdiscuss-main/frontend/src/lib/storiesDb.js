/**
 * storiesDb.js — Signal Stories data layer (v2 — optimized)
 * Uses Fifth Firebase instance (discuss-d48be RTDB)
 *
 * Data layout:
 *   stories/{storyId}                     → story object
 *   storyViews/{storyId}/{viewerUserId}   → true   (per-story view count)
 *   userSeenStories/{userId}/{storyId}    → true   (O(1) read for seen list)
 */

import {
  fifthDatabase,
  isFifthDbAvailable,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  query,
  orderByChild,
  startAt,
} from '@/lib/firebaseFifth';

// -- Caching
const _seenStoriesCache = new Map();
const SEEN_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const storiesRef       = ()              => ref(fifthDatabase, 'stories');
const storyRef         = (id)            => ref(fifthDatabase, `stories/${id}`);
const storyViewsRef    = (id)            => ref(fifthDatabase, `storyViews/${id}`);
const storyViewRef     = (id, viewer)    => ref(fifthDatabase, `storyViews/${id}/${viewer}`);
const userSeenRef      = (uid)           => ref(fifthDatabase, `userSeenStories/${uid}`);
const userSeenItemRef  = (uid, storyId)  => ref(fifthDatabase, `userSeenStories/${uid}/${storyId}`);

function assertDb() {
  if (!isFifthDbAvailable()) throw new Error('Signal database is not available');
}

// ─────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────

export async function createStory(authorId, authorUsername, authorPhotoUrl, text) {
  assertDb();
  const now = Date.now();
  const story = {
    authorId,
    authorUsername: authorUsername || 'user',
    authorPhotoUrl: authorPhotoUrl || '',
    text: String(text).slice(0, 350),
    createdAt: now,
    expiresAt: now + STORY_TTL_MS,
  };
  const newRef = await push(storiesRef(), story);
  await update(newRef, { id: newRef.key });
  return newRef.key;
}

// ─────────────────────────────────────────────
// Delete — complete cleanup (story + all views + user seen index)
// ─────────────────────────────────────────────

/**
 * Fully delete a story from the database.
 * Removes: stories/{id}, storyViews/{id}, and any userSeenStories entries.
 * The userSeenStories entries can't be enumerated cheaply without scanning, so
 * we delete the storyViews pass — the userSeen index just becomes a stale entry
 * that is harmless (filtered out by active story list).
 */
export async function deleteStory(storyId) {
  assertDb();
  await Promise.all([
    remove(storyRef(storyId)),
    remove(storyViewsRef(storyId)),
  ]);
}

// ─────────────────────────────────────────────
// Auto-cleanup of expired stories
// ─────────────────────────────────────────────

/**
 * Called from the subscription callback whenever expired stories slip through
 * (edge case: stories that expired while client was offline).
 * Fire-and-forget, does not await.
 */
function purgeExpiredStories(expiredIds) {
  if (!expiredIds.length) return;
  for (const id of expiredIds) {
    remove(storyRef(id)).catch(() => {});
    remove(storyViewsRef(id)).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// Real-time subscription
// ─────────────────────────────────────────────

export function subscribeToActiveStories(callback) {
  if (!isFifthDbAvailable()) { callback([]); return () => {}; }

  // RTDB server-side filter: only fetch stories with expiresAt >= now
  const activeQuery = query(
    storiesRef(),
    orderByChild('expiresAt'),
    startAt(Date.now())
  );

  const unsubscribe = onValue(
    activeQuery,
    (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }

      const now = Date.now();
      const stories = [];
      const expiredIds = [];

      snapshot.forEach((child) => {
        const data = child.val();
        if (!data) return;
        const id = data.id || child.key;
        if (data.expiresAt > now) {
          stories.push({ ...data, id });
        } else {
          // Expired story slipped through — schedule cleanup
          expiredIds.push(id);
        }
      });

      // Lazy cleanup of any expired stories found in the snapshot
      if (expiredIds.length > 0) purgeExpiredStories(expiredIds);

      stories.sort((a, b) => b.createdAt - a.createdAt);
      callback(stories);
    },
    (error) => {
      console.error('subscribeToActiveStories error:', error);
      callback([]);
    }
  );

  return unsubscribe;
}

// ─────────────────────────────────────────────
// Seen / unseen tracking — O(1) per user via dual-write index
// ─────────────────────────────────────────────

/**
 * Mark a story as seen.
 * Dual-writes to storyViews (for view counts) AND userSeenStories (for fast lookup).
 */
export async function markStorySeen(storyId, viewerId) {
  if (!isFifthDbAvailable() || !storyId || !viewerId) return;
  try {
    const cached = _seenStoriesCache.get(viewerId);
    if (cached) {
      cached.data.add(storyId);
    }
    
    await Promise.all([
      set(storyViewRef(storyId, viewerId), true),
      set(userSeenItemRef(viewerId, storyId), true),
    ]);
  } catch (err) {
    console.warn('markStorySeen error:', err.message);
  }
}

/**
 * Get the set of story IDs a viewer has seen — O(1) single-node read.
 * Uses the userSeenStories/{userId} index instead of scanning all storyViews.
 */
export async function getSeenStoryIds(viewerId) {
  if (!isFifthDbAvailable() || !viewerId) return new Set();
  
  const cached = _seenStoriesCache.get(viewerId);
  if (cached && Date.now() - cached.ts < SEEN_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const snap = await get(userSeenRef(viewerId));
    if (!snap.exists()) {
      _seenStoriesCache.set(viewerId, { data: new Set(), ts: Date.now() });
      return new Set();
    }
    
    const result = new Set(Object.keys(snap.val()));
    _seenStoriesCache.set(viewerId, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn('getSeenStoryIds error:', err.message);
    return new Set();
  }
}

/**
 * Subscribe to the user's seen story IDs in real-time.
 * Fires instantly when a new story is marked seen.
 * Returns an unsubscribe function.
 */
export function subscribeToSeenStoryIds(viewerId, callback) {
  if (!isFifthDbAvailable() || !viewerId) { callback(new Set()); return () => {}; }

  const unsubscribe = onValue(
    userSeenRef(viewerId),
    (snap) => {
      callback(snap.exists() ? new Set(Object.keys(snap.val())) : new Set());
    },
    () => callback(new Set())
  );

  return unsubscribe;
}

// ─────────────────────────────────────────────
// View counts
// ─────────────────────────────────────────────

export function subscribeToStoryViews(storyId, callback) {
  if (!isFifthDbAvailable() || !storyId) { callback(0); return () => {}; }

  const unsubscribe = onValue(
    storyViewsRef(storyId),
    (snap) => callback(snap.exists() ? Object.keys(snap.val()).length : 0),
    () => callback(0)
  );

  return unsubscribe;
}

// ─────────────────────────────────────────────
// Grouping utility
// ─────────────────────────────────────────────

export function groupStoriesByAuthor(stories, seenIds, currentUserId) {
  const map = new Map();

  for (const story of stories) {
    if (!map.has(story.authorId)) {
      map.set(story.authorId, {
        authorId: story.authorId,
        authorUsername: story.authorUsername,
        authorPhotoUrl: story.authorPhotoUrl,
        stories: [],
      });
    }
    map.get(story.authorId).stories.push(story);
  }

  for (const group of map.values()) {
    group.stories.sort((a, b) => b.createdAt - a.createdAt);
  }

  const groups = Array.from(map.values());

  groups.sort((a, b) => {
    if (a.authorId === currentUserId) return -1;
    if (b.authorId === currentUserId) return 1;
    const aUnseen = a.stories.some((s) => !seenIds.has(s.id));
    const bUnseen = b.stories.some((s) => !seenIds.has(s.id));
    if (aUnseen && !bUnseen) return -1;
    if (!aUnseen && bUnseen) return 1;
    return 0;
  });

  return groups;
}
