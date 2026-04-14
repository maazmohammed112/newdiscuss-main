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
  
  return Object.entries(posts)
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
};



export const getPosts = async (searchQuery = null) => {
  const cacheKey = `posts_${searchQuery || 'all'}`;
  
  const postsRef = ref(database, 'posts');
  const votesRef = ref(database, 'votes');
  const commentsRef = ref(database, 'comments');
  
  // Fetch primary database
  const [postsSnap, votesSnap, commentsSnap] = await Promise.all([
    get(postsRef),
    get(votesRef),
    get(commentsRef)
  ]);
  
  // Fetch secondary database with timeout - don't block if it fails
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
    // Secondary database unavailable - continue without it
    console.warn('Secondary database unavailable (continuing without it):', e.message);
  }
  
  const posts = postsSnap.exists() ? postsSnap.val() : {};
  const votes = votesSnap.exists() ? votesSnap.val() : {};
  const comments = commentsSnap.exists() ? commentsSnap.val() : {};
  
  let postsList = Object.entries(posts).map(([id, post]) => {
    const postVotes = votes[id] || {};
    const oldComments = comments[id] || {};
    const newComments = secondaryComments[id] || {};
    const upvotes = Object.values(postVotes).filter(v => v === 'up').length;
    const downvotes = Object.values(postVotes).filter(v => v === 'down').length;
    
    // Count comments from both databases
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
  return { id: postId, ...post, ...finalUpdates };
};

export const deletePost = async (postId, userId) => {
  const postRef = ref(database, `posts/${postId}`);
  const snapshot = await get(postRef);
  
  if (!snapshot.exists()) {
    throw new Error('Post not found');
  }
  
  const post = snapshot.val();
  if (post.author_id !== userId) {
    throw new Error('You can only delete your own posts');
  }
  
  // Delete post, votes, and comments
  await Promise.all([
    remove(postRef),
    remove(ref(database, `votes/${postId}`)),
    remove(ref(database, `comments/${postId}`))
  ]);
  
  return { message: 'Post deleted' };
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
  
  return { id: newCommentRef.key, ...newComment };
};

export const deleteComment = async (postId, commentId, userId) => {
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

export const subscribeToPostsRealtime = (callback) => {
  const postsRef = ref(database, 'posts');
  const votesRef = ref(database, 'votes');
  const commentsRef = ref(database, 'comments');
  
  let secondCommentsRef = null;
  let secondaryListenerActive = false;
  
  const updatePosts = async () => {
    try {
      const posts = await getPosts();
      callback(posts);
    } catch (e) {
      console.warn('Error updating posts:', e);
    }
  };
  
  onValue(postsRef, updatePosts);
  onValue(votesRef, updatePosts);
  onValue(commentsRef, updatePosts);
  
  // Try to listen to secondary database comments (optional - don't block if fails)
  try {
    secondCommentsRef = secondaryRef(secondaryDatabase, 'comments');
    secondaryOnValue(secondCommentsRef, updatePosts, (error) => {
      console.warn('Secondary database listener error (non-blocking):', error.message);
    });
    secondaryListenerActive = true;
  } catch (e) {
    console.warn('Failed to setup secondary database listener (non-blocking):', e.message);
  }
  
  // Return unsubscribe function
  return () => {
    off(postsRef);
    off(votesRef);
    off(commentsRef);
    if (secondaryListenerActive && secondCommentsRef) {
      try {
        secondaryOff(secondCommentsRef);
      } catch (e) {
        // Ignore errors when unsubscribing
      }
    }
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
