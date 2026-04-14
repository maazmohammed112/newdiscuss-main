// Comments Database Service - Uses Secondary Firebase (Realtime Database)
// New comments are stored in Realtime Database (second Firebase)
// Uses same Auth UID as primary Firebase for sync
// Includes: Replies, Comment Badges, New Comment Indicators

import {
  secondaryDatabase,
  ref,
  get,
  set,
  push,
  remove,
  update,
  onValue,
  off
} from './firebaseSecondary';

// -- Caching
const _commentsCache = new Map();
const _commentCountCache = new Map();
const COMMENTS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export const invalidateCommentsCache = (postId) => {
  _commentsCache.delete(postId);
  _commentCountCache.delete(postId);
};

/**
 * Create a new comment in Realtime Database
 * @param {string} postId - Post ID from primary Firebase
 * @param {string} text - Comment text
 * @param {Object} user - User object with id, username, photo_url, verified
 * @param {string} postAuthorId - Post author's ID (for notification badge)
 * @returns {Promise<Object>} Created comment
 */
export const createCommentFirestore = async (postId, text, user, postAuthorId = null) => {
  try {
    invalidateCommentsCache(postId);
    const commentsRef = ref(secondaryDatabase, `comments/${postId}`);
    
    const newComment = {
      postId,
      text: text.trim(),
      author_username: user.username || user.displayName || user.email?.split('@')[0],
      author_id: user.id || user.uid,
      author_photo: user.photo_url || user.photoURL || '',
      author_verified: user.verified || false,
      timestamp: new Date().toISOString(),
      replyCount: 0
    };
    
    const newCommentRef = push(commentsRef);
    await set(newCommentRef, newComment);
    
    // Mark post as having new comment for post owner (if not commenting on own post)
    if (postAuthorId && postAuthorId !== user.id) {
      await markNewCommentForOwner(postId, postAuthorId, newCommentRef.key);
    }
    
    return { 
      id: newCommentRef.key, 
      ...newComment
    };
  } catch (error) {
    console.error('Error creating comment:', error);
    throw error;
  }
};

/**
 * Create a reply to a comment
 * @param {string} postId - Post ID
 * @param {string} parentCommentId - Parent comment ID
 * @param {string} text - Reply text
 * @param {Object} user - User object
 * @param {string} parentCommentAuthorId - Parent comment author (for notification)
 * @returns {Promise<Object>} Created reply
 */
export const createReply = async (postId, parentCommentId, text, user, parentCommentAuthorId = null) => {
  try {
    const repliesRef = ref(secondaryDatabase, `replies/${postId}/${parentCommentId}`);
    
    const newReply = {
      postId,
      parentCommentId,
      text: text.trim(),
      author_username: user.username || user.displayName || user.email?.split('@')[0],
      author_id: user.id || user.uid,
      author_photo: user.photo_url || user.photoURL || '',
      author_verified: user.verified || false,
      timestamp: new Date().toISOString()
    };
    
    const newReplyRef = push(repliesRef);
    await set(newReplyRef, newReply);
    
    // Increment reply count on parent comment
    const commentRef = ref(secondaryDatabase, `comments/${postId}/${parentCommentId}/replyCount`);
    const countSnap = await get(commentRef);
    const currentCount = countSnap.exists() ? countSnap.val() : 0;
    await set(commentRef, currentCount + 1);
    
    // Mark reply notification for comment owner (if not replying to own comment)
    if (parentCommentAuthorId && parentCommentAuthorId !== user.id) {
      await markNewReplyForOwner(postId, parentCommentId, parentCommentAuthorId, newReplyRef.key);
    }
    
    return { 
      id: newReplyRef.key, 
      ...newReply
    };
  } catch (error) {
    console.error('Error creating reply:', error);
    throw error;
  }
};

/**
 * Get replies for a comment
 * @param {string} postId - Post ID
 * @param {string} commentId - Comment ID
 * @returns {Promise<Array>} Array of replies
 */
export const getReplies = async (postId, commentId) => {
  try {
    const repliesRef = ref(secondaryDatabase, `replies/${postId}/${commentId}`);
    const snapshot = await get(repliesRef);
    
    if (!snapshot.exists()) return [];
    
    const replies = snapshot.val();
    return Object.entries(replies)
      .map(([id, reply]) => ({ id, ...reply }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (error) {
    console.error('Error getting replies:', error);
    return [];
  }
};

/**
 * Subscribe to replies for a comment
 * @param {string} postId - Post ID
 * @param {string} commentId - Comment ID
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export const subscribeToReplies = (postId, commentId, callback) => {
  const repliesRef = ref(secondaryDatabase, `replies/${postId}/${commentId}`);
  
  const handleReplies = (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const replies = snapshot.val();
    const repliesList = Object.entries(replies)
      .map(([id, reply]) => ({ id, ...reply }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    callback(repliesList);
  };
  
  onValue(repliesRef, handleReplies);
  return () => off(repliesRef);
};

/**
 * Delete a reply
 * @param {string} postId - Post ID
 * @param {string} commentId - Parent comment ID
 * @param {string} replyId - Reply ID
 * @param {string} userId - User ID for authorization
 */
export const deleteReply = async (postId, commentId, replyId, userId) => {
  try {
    const replyRef = ref(secondaryDatabase, `replies/${postId}/${commentId}/${replyId}`);
    const snapshot = await get(replyRef);
    
    if (!snapshot.exists()) throw new Error('Reply not found');
    if (snapshot.val().author_id !== userId) throw new Error('Not authorized');
    
    await remove(replyRef);
    
    // Decrement reply count
    const commentRef = ref(secondaryDatabase, `comments/${postId}/${commentId}/replyCount`);
    const countSnap = await get(commentRef);
    const currentCount = countSnap.exists() ? countSnap.val() : 1;
    await set(commentRef, Math.max(0, currentCount - 1));
    
    return { message: 'Reply deleted' };
  } catch (error) {
    console.error('Error deleting reply:', error);
    throw error;
  }
};

// ============ NEW COMMENT/REPLY BADGES ============

/**
 * Mark new comment for post owner (badge indicator)
 */
export const markNewCommentForOwner = async (postId, ownerId, commentId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `commentBadges/${ownerId}/${postId}/${commentId}`);
    await set(badgeRef, { timestamp: Date.now(), seen: false });
  } catch (error) {
    console.error('Error marking new comment badge:', error);
  }
};

/**
 * Mark new reply for comment owner (badge indicator)
 */
export const markNewReplyForOwner = async (postId, commentId, ownerId, replyId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `replyBadges/${ownerId}/${postId}/${commentId}/${replyId}`);
    await set(badgeRef, { timestamp: Date.now(), seen: false });
  } catch (error) {
    console.error('Error marking new reply badge:', error);
  }
};

/**
 * Check if post has new comments for owner
 */
export const hasNewComments = async (postId, userId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `commentBadges/${userId}/${postId}`);
    const snapshot = await get(badgeRef);
    return snapshot.exists() && Object.keys(snapshot.val()).length > 0;
  } catch {
    return false;
  }
};

/**
 * Clear comment badge when owner views comments
 */
export const clearCommentBadge = async (postId, userId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `commentBadges/${userId}/${postId}`);
    await remove(badgeRef);
  } catch (error) {
    console.error('Error clearing comment badge:', error);
  }
};

/**
 * Check if comment has new replies for owner
 */
export const hasNewReplies = async (postId, commentId, userId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `replyBadges/${userId}/${postId}/${commentId}`);
    const snapshot = await get(badgeRef);
    return snapshot.exists() && Object.keys(snapshot.val()).length > 0;
  } catch {
    return false;
  }
};

/**
 * Clear reply badge when owner views replies
 */
export const clearReplyBadge = async (postId, commentId, userId) => {
  try {
    const badgeRef = ref(secondaryDatabase, `replyBadges/${userId}/${postId}/${commentId}`);
    await remove(badgeRef);
  } catch (error) {
    console.error('Error clearing reply badge:', error);
  }
};

/**
 * Subscribe to comment badges for a user
 */
export const subscribeToCommentBadges = (userId, callback) => {
  const badgeRef = ref(secondaryDatabase, `commentBadges/${userId}`);
  
  const handleBadges = (snapshot) => {
    if (!snapshot.exists()) {
      callback({});
      return;
    }
    callback(snapshot.val());
  };
  
  onValue(badgeRef, handleBadges);
  return () => off(badgeRef);
};

// ============ EXISTING FUNCTIONS ============

/**
 * Get all comments for a post from Realtime Database
 */
export const getCommentsFirestore = async (postId) => {
  try {
    const cached = _commentsCache.get(postId);
    if (cached && Date.now() - cached.ts < COMMENTS_CACHE_TTL) {
      return cached.data;
    }

    const commentsRef = ref(secondaryDatabase, `comments/${postId}`);
    const snapshot = await get(commentsRef);
    
    if (!snapshot.exists()) return [];
    
    const comments = snapshot.val();
    const result = Object.entries(comments)
      .map(([id, comment]) => ({
        id,
        ...comment,
        replyCount: comment.replyCount || 0
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    _commentsCache.set(postId, { data: result, ts: Date.now() });
    return result;
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
};

/**
 * Delete a comment from Realtime Database
 */
export const deleteCommentFirestore = async (commentId, userId, postId) => {
  try {
    invalidateCommentsCache(postId);
    const commentRef = ref(secondaryDatabase, `comments/${postId}/${commentId}`);
    const snapshot = await get(commentRef);
    
    if (!snapshot.exists()) throw new Error('Comment not found');
    if (snapshot.val().author_id !== userId) throw new Error('Not authorized');
    
    // Also delete all replies
    const repliesRef = ref(secondaryDatabase, `replies/${postId}/${commentId}`);
    await remove(repliesRef);
    
    await remove(commentRef);
    return { message: 'Comment deleted' };
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time comments for a post
 */
export const subscribeToCommentsFirestore = (postId, callback) => {
  let commentsRef = null;
  let listenerActive = false;
  
  try {
    commentsRef = ref(secondaryDatabase, `comments/${postId}`);
    
    const handleComments = (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      
      const comments = snapshot.val();
      const commentsList = Object.entries(comments)
        .map(([id, comment]) => ({
          id,
          ...comment,
          replyCount: comment.replyCount || 0
        }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      callback(commentsList);
    };
    
    const handleError = (error) => {
      console.warn('Secondary comments listener error:', error.message);
      callback([]);
    };
    
    onValue(commentsRef, handleComments, handleError);
    listenerActive = true;
  } catch (e) {
    console.warn('Failed to setup secondary comments listener:', e.message);
    callback([]);
  }
  
  return () => {
    if (listenerActive && commentsRef) {
      try { off(commentsRef); } catch {}
    }
  };
};

/**
 * Get comment count for a post
 */
export const getCommentCountFirestore = async (postId) => {
  try {
    const cachedCount = _commentCountCache.get(postId);
    if (cachedCount && Date.now() - cachedCount.ts < COMMENTS_CACHE_TTL) {
      return cachedCount.data;
    }
  
    const comments = await getCommentsFirestore(postId);
    const count = comments.length;
    _commentCountCache.set(postId, { data: count, ts: Date.now() });
    return count;
  } catch {
    return 0;
  }
};

/**
 * Update author_verified for all comments by a user
 */
export const syncUserVerificationInCommentsFirestore = async (userId, verified) => {
  try {
    const commentsRef = ref(secondaryDatabase, 'comments');
    const snapshot = await get(commentsRef);
    
    if (!snapshot.exists()) return;
    
    const allComments = snapshot.val();
    const updates = {};
    
    Object.entries(allComments).forEach(([postId, comments]) => {
      Object.entries(comments).forEach(([commentId, comment]) => {
        if (comment.author_id === userId) {
          updates[`comments/${postId}/${commentId}/author_verified`] = verified;
        }
      });
    });
    
    if (Object.keys(updates).length > 0) {
      await update(ref(secondaryDatabase), updates);
    }
  } catch (error) {
    console.error('Error syncing verification:', error);
  }
};
