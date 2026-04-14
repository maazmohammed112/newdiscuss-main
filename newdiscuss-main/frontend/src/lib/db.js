// Firebase Database Service - Direct Firebase operations (no backend needed)
import { 
  database, 
  ref, 
  get, 
  set, 
  push, 
  update, 
  remove, 
  onValue,
  off,
  query,
  orderByChild
} from './firebase';
import { 
  secondaryDatabase, 
  ref as secondaryRef, 
  get as secondaryGet,
  onValue as secondaryOnValue,
  off as secondaryOff
} from './firebaseSecondary';
import { openDB } from 'idb';

// IndexedDB for offline caching
const DB_NAME = 'discuss_offline';
const DB_VERSION = 1;

const getDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    },
  });
};

// Cache helpers
const cacheData = async (key, data) => {
  try {
    const db = await getDB();
    await db.put('cache', { key, data, timestamp: Date.now() });
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
};

const getCachedData = async (key, maxAge = 5 * 60 * 1000) => {
  try {
    const db = await getDB();
    const cached = await db.get('cache', key);
    if (cached && Date.now() - cached.timestamp < maxAge) {
      return cached.data;
    }
  } catch (e) {
    console.warn('Cache read failed:', e);
  }
  return null;
};

export const invalidatePostsCache = async () => {
  try {
    const db = await getDB();
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    const keys = await store.getAllKeys();
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith('posts_')) {
        store.delete(key);
      }
    }
    await tx.done;
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
};

// Helper to extract hashtags from text
const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#(\w+)/g);
  return matches ? [...new Set(matches.map(t => t.slice(1).toLowerCase()))] : [];
};

// ==================== ADMIN SETTINGS ====================

export const getAdminSettings = async () => {
  const settingsRef = ref(database, 'admin_settings');
  const snapshot = await get(settingsRef);
  if (snapshot.exists()) {
    return snapshot.val();
  }
  // Default settings
  return {
    signup_enabled: true,
    forgot_password_enabled: true
  };
};

export const initAdminSettings = async () => {
  const settingsRef = ref(database, 'admin_settings');
  const snapshot = await get(settingsRef);
  if (!snapshot.exists()) {
    await set(settingsRef, {
      signup_enabled: true,
      forgot_password_enabled: true
    });
  }
};

// Initialize admin settings on first load
initAdminSettings().catch(console.error);

// ==================== USER OPERATIONS ====================

// ── In-memory user cache (avoids repeated Firebase reads in the same session) ──
const _userCache = new Map(); // key: userId → { data, ts }
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const _getUserFromCache = (userId) => {
  const entry = _userCache.get(userId);
  if (entry && Date.now() - entry.ts < USER_CACHE_TTL) return entry.data;
  return null;
};

const _setUserCache = (userId, data) => {
  _userCache.set(userId, { data, ts: Date.now() });
};

export const invalidateUserCache = (userId) => {
  _userCache.delete(userId);
};

export const createUser = async (userId, userData) => {
  const userRef = ref(database, `users/${userId}`);
  await set(userRef, {
    ...userData,
    verified: false, // Default verified status
    admin_message: '', // Default admin message (empty means no message)
    created_at: new Date().toISOString()
  });
  return { id: userId, ...userData, verified: false, admin_message: '' };
};

export const getUser = async (userId) => {
  // Return from cache if fresh
  const cached = _getUserFromCache(userId);
  if (cached) return cached;

  const userRef = ref(database, `users/${userId}`);
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    const userData = snapshot.val();
    const result = { 
      id: userId, 
      ...userData,
      verified: userData.verified || false,
      admin_message: userData.admin_message || ''
    };
    _setUserCache(userId, result);
    return result;
  }
  return null;
};


/**
 * Get all users (for search/add members)
 */
export const getAllUsers = async () => {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) return [];
    
    const users = snapshot.val();
    return Object.entries(users).map(([id, data]) => ({
      id,
      ...data
    }));
  } catch (error) {
    console.error('Error getting all users:', error);
    return [];
  }
};


export const getUserByEmail = async (email) => {
  const usersRef = ref(database, 'users');
  const snapshot = await get(usersRef);
  if (snapshot.exists()) {
    const users = snapshot.val();
    for (const [id, user] of Object.entries(users)) {
      if (user.email?.toLowerCase() === email.toLowerCase()) {
        return { 
          id, 
          ...user,
          verified: user.verified || false // Ensure verified field exists
        };
      }
    }
  }
  return null;
};

export const checkUsernameAvailable = async (username) => {
  const usersRef = ref(database, 'users');
  const snapshot = await get(usersRef);
  if (snapshot.exists()) {
    const users = snapshot.val();
    for (const user of Object.values(users)) {
      if (user.username?.toLowerCase() === username.toLowerCase()) {
        return false;
      }
    }
  }
  return true;
};

export const checkEmailAvailable = async (email) => {
  const usersRef = ref(database, 'users');
  const snapshot = await get(usersRef);
  if (snapshot.exists()) {
    const users = snapshot.val();
    for (const user of Object.values(users)) {
      if (user.email?.toLowerCase() === email.toLowerCase()) {
        return false;
      }
    }
  }
  return true;
};

export const updateUser = async (userId, updates) => {
  const userRef = ref(database, `users/${userId}`);
  await update(userRef, updates);
  // Invalidate cache so next read picks up new data
  invalidateUserCache(userId);
};

// ==================== POST OPERATIONS ====================

export const createPost = async (postData, user) => {
  const postsRef = ref(database, 'posts');
  const contentTags = extractHashtags(postData.content);
  const titleTags = extractHashtags(postData.title || '');
  const allTags = [...new Set([...(postData.hashtags || []), ...contentTags, ...titleTags])];
  
  const newPost = {
    type: postData.type,
    title: (postData.title || '').trim(),
    content: postData.content.trim(),
    github_link: (postData.github_link || '').trim(),
    preview_link: (postData.preview_link || '').trim(),
    hashtags: allTags,
    author_username: user.username || user.displayName || user.email?.split('@')[0],
    author_id: user.id || user.uid,
    author_photo: user.photo_url || user.photoURL || '',
    author_verified: user.verified || false, // Include verified status
    timestamp: new Date().toISOString()
  };
  
  const newPostRef = push(postsRef);
  await set(newPostRef, newPost);
  await invalidatePostsCache();
  
  return {
    id: newPostRef.key,
    ...newPost,
    upvote_count: 0,
    downvote_count: 0,
    comment_count: 0,
    votes: {}
  };
};

export const getPostById = async (postId) => {
  const postRef = ref(database, `posts/${postId}`);
  const votesRef = ref(database, `votes/${postId}`);
  const commentsRef = ref(database, `comments/${postId}`);
  
  const [postSnap, votesSnap, commentsSnap] = await Promise.all([
    get(postRef), get(votesRef), get(commentsRef)
  ]);
  
  if (!postSnap.exists()) return null;
  
  // Fetch secondary comments with timeout
  let newComments = {};
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Secondary DB timeout')), 3000)
    );
    const secondaryCommentsRef = secondaryRef(secondaryDatabase, `comments/${postId}`);
    const secondaryCommentsSnap = await Promise.race([
      secondaryGet(secondaryCommentsRef),
      timeoutPromise
    ]);
    newComments = secondaryCommentsSnap?.exists?.() ? secondaryCommentsSnap.val() : {};
  } catch (e) {
    console.warn('Secondary database unavailable:', e.message);
  }
  
  const postVotes = votesSnap.exists() ? votesSnap.val() : {};
  const oldComments = commentsSnap.exists() ? commentsSnap.val() : {};
  
  // Count comments from both databases
  const totalCommentCount = Object.keys(oldComments).length + Object.keys(newComments).length;
  
  return {
    id: postId,
    ...postSnap.val(),
    upvote_count: Object.values(postVotes).filter(v => v === 'up').length,
    downvote_count: Object.values(postVotes).filter(v => v === 'down').length,
    comment_count: totalCommentCount,
    votes: postVotes
  };
};

export const getPostsByUser = async (userId) => {
  const cacheKey = `posts_user_${userId}`;
  const cached = await getCachedData(cacheKey);
  if (cached && cached.length > 0) return cached;
  
  const postsRef = ref(database, 'posts');
  const votesRef = ref(database, 'votes');
  const commentsRef = ref(database, 'comments');
  
  const [postsSnap, votesSnap, commentsSnap] = await Promise.all([
    get(postsRef), get(votesRef), get(commentsRef)
  ]);
  
  // Fetch secondary database with timeout
  let secondaryComments = {};
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Secondary DB timeout')), 3000)
    );
    const secondaryCommentsRef = secondaryRef(secondaryDatabase, 'comments');
    const secondaryCommentsSnap = await Promise.race([
      secondaryGet(secondaryCommentsRef),
      timeoutPromise
    ]);
    secondaryComments = secondaryCommentsSnap?.exists?.() ? secondaryCommentsSnap.val() : {};
  } catch (e) {
    console.warn('Secondary database unavailable:', e.message);
  }
  
  const posts = postsSnap.exists() ? postsSnap.val() : {};
  const votes = votesSnap.exists() ? votesSnap.val() : {};
  const comments = commentsSnap.exists() ? commentsSnap.val() : {};
  
  const result = Object.entries(posts)
    .filter(([, p]) => p.author_id === userId)
    .map(([id, post]) => {
      const pv = votes[id] || {};
      const oldComments = comments[id] || {};
      const newComments = secondaryComments[id] || {};
      const totalCommentCount = Object.keys(oldComments).length + Object.keys(newComments).length;
      return {
        id, ...post,
        upvote_count: Object.values(pv).filter(v => v === 'up').length,
        downvote_count: Object.values(pv).filter(v => v === 'down').length,
        comment_count: totalCommentCount,
        votes: pv
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
  await cacheData(cacheKey, result);
  return result;
};



export const getPosts = async (searchQuery = null) => {
  const cacheKey = `posts_${searchQuery || 'all'}`;
  const cached = await getCachedData(cacheKey);
  if (cached && cached.length > 0) return cached;
  
  const postsRef = ref(database, 'posts');
  const votesRef = ref(database, 'votes');
  const commentsRef = ref(database, 'comments');
  
  // Fetch primary databases in parallel
  const [postsSnap, votesSnap, commentsSnap] = await Promise.all([
    get(postsRef),
    get(votesRef),
    get(commentsRef)
  ]);
  
  // Use the shared secondary-comments cache (fetched once, reused for 2 min)
  const secondaryComments = await _getSecondaryCommentsCached();
  
  const posts = postsSnap.exists() ? postsSnap.val() : {};
  const votes = votesSnap.exists() ? votesSnap.val() : {};
  const comments = commentsSnap.exists() ? commentsSnap.val() : {};
  
  let postsList = Object.entries(posts).map(([id, post]) => {
    const postVotes = votes[id] || {};
    const oldComments = comments[id] || {};
    const newComments = secondaryComments[id] || {};
    const upvotes = Object.values(postVotes).filter(v => v === 'up').length;
    const downvotes = Object.values(postVotes).filter(v => v === 'down').length;
    const totalCommentCount = Object.keys(oldComments).length + Object.keys(newComments).length;
    
    return {
      id,
      ...post,
      upvote_count: upvotes,
      downvote_count: downvotes,
      comment_count: totalCommentCount,
      votes: postVotes
    };
  });
  
  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    postsList = postsList.filter(p => 
      p.title?.toLowerCase().includes(q) ||
      p.content?.toLowerCase().includes(q) ||
      p.author_username?.toLowerCase().includes(q) ||
      p.type?.toLowerCase().includes(q) ||
      (p.hashtags || []).some(t => t.toLowerCase().includes(q.replace('#', '')))
    );
  }
  
  // Sort by timestamp descending
  postsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Cache results
  await cacheData(cacheKey, postsList);
  
  return postsList;
};

export const updatePost = async (postId, updates, userId) => {
  const postRef = ref(database, `posts/${postId}`);
  const snapshot = await get(postRef);
  
  if (!snapshot.exists()) {
    throw new Error('Post not found');
  }
  
  const post = snapshot.val();
  if (post.author_id !== userId) {
    throw new Error('You can only edit your own posts');
  }
  
  const contentTags = extractHashtags(updates.content || post.content);
  const titleTags = extractHashtags(updates.title || post.title);
  const existingTags = updates.hashtags !== undefined ? updates.hashtags : (post.hashtags || []);
  
  const finalUpdates = {
    ...updates,
    hashtags: [...new Set([...existingTags, ...contentTags, ...titleTags])]
  };
  
  await update(postRef, finalUpdates);
  await invalidatePostsCache();
  return { id: postId, ...post, ...finalUpdates };
};

export const deletePost = async (postId, userId) => {
  const postRef = ref(database, `posts/${postId}`);
  const postSnap = await get(postRef);
  if (!postSnap.exists() || postSnap.val().author_id !== userId) {
    throw new Error('Not authorized to delete this post');
  }
  
  const votesRef = ref(database, `votes/${postId}`);
  const primaryCommentsRef = ref(database, `comments/${postId}`);
  const secondaryCommentsRef = secondaryRef(secondaryDatabase, `comments/${postId}`);
  
  await Promise.all([
    remove(postRef),
    remove(votesRef),
    remove(primaryCommentsRef)
  ]);
  
  try {
    await secondaryRemove(secondaryCommentsRef);
  } catch (e) {
    console.warn('Failed to clean up secondary comments:', e.message);
  }
  
  await invalidatePostsCache();
  return { message: 'Post deleted' };
};

export const upvotePost = async (postId, userId) => {
  const voteRef = ref(database, `votes/${postId}/${userId}`);
  const voteSnap = await get(voteRef);
  
  if (voteSnap.exists() && voteSnap.val() === 'up') {
    await remove(voteRef); // Remove vote if already upvoted
  } else {
    await set(voteRef, 'up');
  }
  await invalidatePostsCache();
};

export const downvotePost = async (postId, userId) => {
  const voteRef = ref(database, `votes/${postId}/${userId}`);
  const voteSnap = await get(voteRef);
  
  if (voteSnap.exists() && voteSnap.val() === 'down') {
    await remove(voteRef); // Remove vote if already downvoted
  } else {
    await set(voteRef, 'down');
  }
  await invalidatePostsCache();
};

// ==================== VOTE OPERATIONS ====================

export const toggleVote = async (postId, voteType, userId) => {
  const voteRef = ref(database, `votes/${postId}/${userId}`);
  const allVotesRef = ref(database, `votes/${postId}`);
  
  // Get current user's vote
  const currentVoteSnap = await get(voteRef);
  const currentVote = currentVoteSnap.exists() ? currentVoteSnap.val() : null;
  
  if (currentVote === voteType) {
    // Same vote clicked again - toggle it off (unlike/un-dislike)
    await remove(voteRef);
  } else {
    // Set new vote (or switch from like to dislike / dislike to like)
    await set(voteRef, voteType);
  }
  
  // Get updated vote counts
  const updatedVotesSnap = await get(allVotesRef);
  const updatedVotes = updatedVotesSnap.exists() ? updatedVotesSnap.val() : {};
  
  await invalidatePostsCache();
  
  return {
    upvote_count: Object.values(updatedVotes).filter(v => v === 'up').length,
    downvote_count: Object.values(updatedVotes).filter(v => v === 'down').length,
    votes: updatedVotes
  };
};

// ==================== COMMENT OPERATIONS ====================

export const getComments = async (postId) => {
  const commentsRef = ref(database, `comments/${postId}`);
  const snapshot = await get(commentsRef);
  
  if (!snapshot.exists()) return [];
  
  const comments = snapshot.val();
  return Object.entries(comments)
    .map(([id, comment]) => ({ id, ...comment }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

export const createComment = async (postId, text, user) => {
  const commentsRef = ref(database, `comments/${postId}`);
  
  const newComment = {
    text: text.trim(),
    author_username: user.username || user.displayName || user.email?.split('@')[0],
    author_id: user.id || user.uid,
    author_photo: user.photo_url || user.photoURL || '',
    author_verified: user.verified || false, // Include verified status
    timestamp: new Date().toISOString()
  };
  
  const newCommentRef = push(commentsRef);
  await set(newCommentRef, newComment);
  
  await invalidatePostsCache();
  
  return {
    id: newCommentRef.key,
    ...newComment
  };
};

export const deleteComment = async (commentId, userId, postId) => {
  const commentRef = ref(database, `comments/${postId}/${commentId}`);
  const snapshot = await get(commentRef);
  
  if (!snapshot.exists()) {
    throw new Error('Comment not found');
  }
  
  const comment = snapshot.val();
  if (comment.author_id !== userId) {
    throw new Error('You can only delete your own comments');
  }
  
  await remove(commentRef);
  await invalidatePostsCache();
  return { message: 'Comment deleted' };
};

// ==================== HASHTAG OPERATIONS ====================

export const getTrendingHashtags = async () => {
  const postsRef = ref(database, 'posts');
  const snapshot = await get(postsRef);
  
  if (!snapshot.exists()) return [];
  
  const posts = snapshot.val();
  const tagData = {};
  
  // Collect hashtags with count and latest timestamp
  Object.values(posts).forEach(post => {
    const postTime = new Date(post.timestamp).getTime();
    (post.hashtags || []).forEach(tag => {
      if (!tagData[tag]) {
        tagData[tag] = { count: 0, latestTimestamp: 0 };
      }
      tagData[tag].count += 1;
      if (postTime > tagData[tag].latestTimestamp) {
        tagData[tag].latestTimestamp = postTime;
      }
    });
  });
  
  const tagsArray = Object.entries(tagData).map(([tag, data]) => ({
    tag,
    count: data.count,
    latestTimestamp: data.latestTimestamp
  }));
  
  // Check if all tags have count 1 (no repeats)
  const allSingleUse = tagsArray.every(t => t.count === 1);
  
  if (allSingleUse) {
    // Show latest 4 hashtags by timestamp
    return tagsArray
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .slice(0, 4)
      .map(({ tag, count }) => ({ tag, count }));
  } else {
    // Show top 4 most used hashtags
    return tagsArray
      .sort((a, b) => b.count - a.count || b.latestTimestamp - a.latestTimestamp)
      .slice(0, 4)
      .map(({ tag, count }) => ({ tag, count }));
  }
};

// ==================== ADMIN MESSAGE ====================

export const getAdminMessage = async () => {
  const messageRef = ref(database, 'admin_settings/admin_message');
  const snapshot = await get(messageRef);
  return snapshot.exists() ? snapshot.val() : null;
};

export const subscribeToAdminMessage = (callback) => {
  const messageRef = ref(database, 'admin_settings/admin_message');
  onValue(messageRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(messageRef);
};

// ==================== USER STATS ====================

export const getUserStats = async (userId) => {
  const postsRef = ref(database, 'posts');
  const snapshot = await get(postsRef);
  
  if (!snapshot.exists()) return { post_count: 0 };
  
  const posts = snapshot.val();
  const postCount = Object.values(posts).filter(p => p.author_id === userId).length;
  
  return { post_count: postCount };
};

// ==================== REALTIME LISTENERS ====================

// ── Secondary comments in-memory cache (2-minute TTL) ─────────────────────────
// The secondary DB is fetched ONCE on subscription, then reused for 2 min.
// This eliminates the 3-8s secondary-DB stampede that fires on every vote/comment change.
let _secondaryCommentsCache = null;
let _secondaryCommentsCacheTs = 0;
const SECONDARY_COMMENTS_TTL = 2 * 60 * 1000; // 2 minutes

const _getSecondaryCommentsCached = async () => {
  if (_secondaryCommentsCache && Date.now() - _secondaryCommentsCacheTs < SECONDARY_COMMENTS_TTL) {
    return _secondaryCommentsCache;
  }
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Secondary DB timeout')), 4000)
    );
    const secondaryCommentsRootRef = secondaryRef(secondaryDatabase, 'comments');
    const snap = await Promise.race([secondaryGet(secondaryCommentsRootRef), timeoutPromise]);
    const data = snap?.exists?.() ? snap.val() : {};
    _secondaryCommentsCache = data;
    _secondaryCommentsCacheTs = Date.now();
    return data;
  } catch (e) {
    console.warn('[RT] Secondary DB unavailable (using cache/empty):', e.message);
    return _secondaryCommentsCache || {};
  }
};

// Build posts array directly from snapshots — avoids a second round-trip to Firebase
const _buildPostsFromSnapshots = (postsVal, votesVal, commentsVal, secondaryComments) => {
  const posts = postsVal || {};
  const votes = votesVal || {};
  const comments = commentsVal || {};

  return Object.entries(posts)
    .map(([id, post]) => {
      const postVotes = votes[id] || {};
      const oldComments = comments[id] || {};
      const newComments = secondaryComments[id] || {};
      return {
        id,
        ...post,
        upvote_count: Object.values(postVotes).filter(v => v === 'up').length,
        downvote_count: Object.values(postVotes).filter(v => v === 'down').length,
        comment_count: Object.keys(oldComments).length + Object.keys(newComments).length,
        votes: postVotes,
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

export const subscribeToPostsRealtime = (callback) => {
  const postsRef   = ref(database, 'posts');
  const votesRef   = ref(database, 'votes');
  const commentsRef = ref(database, 'comments');

  // Snapshot holders — updated by each individual listener
  let snapshotPosts    = null;
  let snapshotVotes    = null;
  let snapshotComments = null;

  // Debounce: if multiple nodes fire at once, only rebuild once
  let debounceTimer = null;
  const scheduleUpdate = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!snapshotPosts) return;
      try {
        const secondaryComments = await _getSecondaryCommentsCached();
        const built = _buildPostsFromSnapshots(snapshotPosts, snapshotVotes, snapshotComments, secondaryComments);
        // Also update the db.js local cache so getPosts() is fast on next call
        await cacheData('posts_all', built);
        callback(built);
      } catch (e) {
        console.warn('[RT] Error building posts:', e);
      }
    }, 150); // 150ms debounce — coalesces rapid burst events
  };

  const handlePosts    = (snap) => { snapshotPosts    = snap.exists() ? snap.val() : {}; scheduleUpdate(); };
  const handleVotes    = (snap) => { snapshotVotes    = snap.exists() ? snap.val() : {}; scheduleUpdate(); };
  const handleComments = (snap) => { snapshotComments = snap.exists() ? snap.val() : {}; scheduleUpdate(); };

  onValue(postsRef,    handlePosts);
  onValue(votesRef,    handleVotes);
  onValue(commentsRef, handleComments);

  // Return unsubscribe function
  return () => {
    clearTimeout(debounceTimer);
    off(postsRef);
    off(votesRef);
    off(commentsRef);
  };
};

export const subscribeToCommentsRealtime = (postId, callback) => {
  const commentsRef = ref(database, `comments/${postId}`);
  
  const handleComments = (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const comments = snapshot.val();
    const commentsList = Object.entries(comments)
      .map(([id, comment]) => ({ id, ...comment }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    callback(commentsList);
  };
  
  onValue(commentsRef, handleComments);
  
  return () => off(commentsRef);
};


// ==================== SYNC VERIFICATION STATUS ====================

/**
 * Update author_verified field for all posts by a specific user
 */
export const syncUserVerificationInPosts = async (userId, verified) => {
  try {
    const postsRef = ref(database, 'posts');
    const snapshot = await get(postsRef);
    
    if (!snapshot.exists()) return;
    
    const posts = snapshot.val();
    const updates = {};
    
    // Find all posts by this user and update their author_verified field
    Object.entries(posts).forEach(([postId, post]) => {
      if (post.author_id === userId) {
        updates[`posts/${postId}/author_verified`] = verified;
      }
    });
    
    // Apply all updates at once
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
      console.log(`Updated ${Object.keys(updates).length} posts for user ${userId}`);
    }
  } catch (error) {
    console.error('Error syncing verification in posts:', error);
  }
};

/**
 * Update author_verified field for all comments by a specific user
 */
export const syncUserVerificationInComments = async (userId, verified) => {
  try {
    const commentsRef = ref(database, 'comments');
    const snapshot = await get(commentsRef);
    
    if (!snapshot.exists()) return;
    
    const allComments = snapshot.val();
    const updates = {};
    
    // Find all comments by this user across all posts
    Object.entries(allComments).forEach(([postId, comments]) => {
      Object.entries(comments).forEach(([commentId, comment]) => {
        if (comment.author_id === userId) {
          updates[`comments/${postId}/${commentId}/author_verified`] = verified;
        }
      });
    });
    
    // Apply all updates at once
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
      console.log(`Updated ${Object.keys(updates).length} comments for user ${userId}`);
    }
  } catch (error) {
    console.error('Error syncing verification in comments:', error);
  }
};

/**
 * Sync verification status across all user's posts and comments
 */
export const syncUserVerificationEverywhere = async (userId, verified) => {
  console.log(`Syncing verification status (${verified}) for user ${userId}`);
  await Promise.all([
    syncUserVerificationInPosts(userId, verified),
    syncUserVerificationInComments(userId, verified)
  ]);
  console.log('Verification sync complete');
};
