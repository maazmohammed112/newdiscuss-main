/**
 * storiesDb.js — Signal Stories data layer
 * Uses Fifth Firebase instance (discuss-d48be RTDB)
 *
 * Data layout:
 *   stories/{storyId}  → story object
 *   storyViews/{storyId}/{viewerUserId} → true
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

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function storiesRef() {
  return ref(fifthDatabase, 'stories');
}

function storyRef(storyId) {
  return ref(fifthDatabase, `stories/${storyId}`);
}

function storyViewsRef(storyId) {
  return ref(fifthDatabase, `storyViews/${storyId}`);
}

function storyViewRef(storyId, viewerId) {
  return ref(fifthDatabase, `storyViews/${storyId}/${viewerId}`);
}

function assertDb() {
  if (!isFifthDbAvailable()) {
    throw new Error('Signal database is not available');
  }
}

// ─────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────

/**
 * Create a new story for the given user.
 * Returns the new story id.
 */
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
  // Embed the id inside the record for convenience
  await update(newRef, { id: newRef.key });
  return newRef.key;
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

/**
 * Delete a story and all its view records.
 * Only the story owner should call this.
 */
export async function deleteStory(storyId) {
  assertDb();
  await Promise.all([
    remove(storyRef(storyId)),
    remove(storyViewsRef(storyId)),
  ]);
}

// ─────────────────────────────────────────────
// Real-time subscription
// ─────────────────────────────────────────────

/**
 * Subscribe to all active (non-expired) stories.
 * Callback receives an array of story objects, grouped / sorted by the caller.
 * Returns an unsubscribe function.
 */
export function subscribeToActiveStories(callback) {
  if (!isFifthDbAvailable()) {
    callback([]);
    return () => {};
  }

  // Order by expiresAt and fetch only stories that haven't expired yet.
  // RTDB startAt on a server-side ordered query keeps payload minimal.
  const activeQuery = query(
    storiesRef(),
    orderByChild('expiresAt'),
    startAt(Date.now())
  );

  const unsubscribe = onValue(
    activeQuery,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const now = Date.now();
      const stories = [];
      snapshot.forEach((child) => {
        const data = child.val();
        // Double-check expiry client-side (handles any RTDB clock skew)
        if (data && data.expiresAt > now) {
          stories.push({ ...data, id: data.id || child.key });
        }
      });

      // Sort newest-first within each author; overall order by first-story time
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
// Seen / unseen tracking
// ─────────────────────────────────────────────

/**
 * Mark a story as seen by a viewer.
 * Idempotent — safe to call multiple times.
 */
export async function markStorySeen(storyId, viewerId) {
  if (!isFifthDbAvailable() || !storyId || !viewerId) return;
  try {
    await set(storyViewRef(storyId, viewerId), true);
  } catch (err) {
    console.warn('markStorySeen error:', err.message);
  }
}

/**
 * Get the set of story IDs that a viewer has already seen.
 * Returns a Set<string>.
 */
export async function getSeenStoryIds(viewerId) {
  if (!isFifthDbAvailable() || !viewerId) return new Set();
  try {
    const viewsRoot = ref(fifthDatabase, 'storyViews');
    const snapshot = await get(viewsRoot);
    if (!snapshot.exists()) return new Set();

    const seenIds = new Set();
    snapshot.forEach((storySnap) => {
      if (storySnap.child(viewerId).exists()) {
        seenIds.add(storySnap.key);
      }
    });
    return seenIds;
  } catch (err) {
    console.warn('getSeenStoryIds error:', err.message);
    return new Set();
  }
}

// ─────────────────────────────────────────────
// View counts
// ─────────────────────────────────────────────

/**
 * Get the total viewer count for a story (one-time fetch).
 */
export async function getStoryViewCount(storyId) {
  if (!isFifthDbAvailable() || !storyId) return 0;
  try {
    const snap = await get(storyViewsRef(storyId));
    if (!snap.exists()) return 0;
    return Object.keys(snap.val()).length;
  } catch {
    return 0;
  }
}

/**
 * Subscribe to real-time view count for a story.
 * Intended for the story owner only.
 * Returns an unsubscribe function.
 */
export function subscribeToStoryViews(storyId, callback) {
  if (!isFifthDbAvailable() || !storyId) {
    callback(0);
    return () => {};
  }

  const unsubscribe = onValue(
    storyViewsRef(storyId),
    (snap) => {
      callback(snap.exists() ? Object.keys(snap.val()).length : 0);
    },
    () => callback(0)
  );

  return unsubscribe;
}

/**
 * Group an array of stories by authorId.
 * Returns an array of { authorId, authorUsername, authorPhotoUrl, stories[] }
 * sorted so users with unseen stories come first.
 */
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

  // Sort each author's stories newest-first
  for (const group of map.values()) {
    group.stories.sort((a, b) => b.createdAt - a.createdAt);
  }

  const groups = Array.from(map.values());

  // Sort groups: current user first, then unseen, then seen
  groups.sort((a, b) => {
    if (a.authorId === currentUserId) return -1;
    if (b.authorId === currentUserId) return 1;

    const aHasUnseen = a.stories.some((s) => !seenIds.has(s.id));
    const bHasUnseen = b.stories.some((s) => !seenIds.has(s.id));
    if (aHasUnseen && !bHasUnseen) return -1;
    if (!aHasUnseen && bHasUnseen) return 1;
    return 0;
  });

  return groups;
}
