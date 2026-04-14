// Relationships Database Service - Uses Secondary Firebase (Realtime Database)
// Stores: Friendships, Friend Requests, Relationship Status
// Uses same Auth UID as primary Firebase for sync

import {
  secondaryDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  off,
  query,
  orderByChild,
  equalTo
} from './firebaseSecondary';

// Relationship statuses
export const RELATIONSHIP_STATUS = {
  NONE: 'none',
  PENDING_SENT: 'pending_sent',
  PENDING_RECEIVED: 'pending_received',
  FRIENDS: 'friends',
  UNFOLLOWED: 'unfollowed'
};

// ── In-memory cache for user search (avoids full-table reads on every search keystroke) ──
let _allUsersCache = null;
let _allUsersCacheTs = 0;
const ALL_USERS_TTL = 3 * 60 * 1000; // 3 minutes

const _getAllUsersCacheFresh = () => {
  if (_allUsersCache && Date.now() - _allUsersCacheTs < ALL_USERS_TTL) return _allUsersCache;
  return null;
};


/**
 * Get all users from primary database for search
 */
export const getAllUsersForSearch = async () => {
  // Return from memory cache if fresh
  const cached = _getAllUsersCacheFresh();
  if (cached) return cached;

  try {
    // Import from primary database
    const { database, ref: primaryRef, get: primaryGet } = await import('./firebase');
    const usersRef = primaryRef(database, 'users');
    const snapshot = await primaryGet(usersRef);
    
    if (!snapshot.exists()) return [];
    
    const users = snapshot.val();
    const result = Object.entries(users).map(([id, user]) => ({
      id,
      username: user.username,
      email: user.email,
      photo_url: user.photo_url || '',
      verified: user.verified || false,
      created_at: user.created_at
    }));

    // Store in cache
    _allUsersCache = result;
    _allUsersCacheTs = Date.now();
    return result;
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

/**
 * Search users by username or email
 * @param {string} searchQuery - Search term
 * @param {string} currentUserId - Current user's ID to exclude
 */
export const searchUsers = async (searchQuery, currentUserId) => {
  try {
    const allUsers = await getAllUsersForSearch();
    const query = searchQuery.toLowerCase().trim();
    
    return allUsers
      .filter(user => 
        user.id !== currentUserId &&
        (user.username?.toLowerCase().includes(query) ||
         user.email?.toLowerCase().includes(query))
      )
      .slice(0, 20); // Limit results
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};

/**
 * Send a friend request
 * @param {string} fromUserId - Sender's user ID
 * @param {string} toUserId - Recipient's user ID
 */
export const sendFriendRequest = async (fromUserId, toUserId, fromUsername = null) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Add to sender's sent requests
    const sentRef = ref(secondaryDatabase, `relationships/${fromUserId}/sentRequests/${toUserId}`);
    await set(sentRef, {
      status: 'pending',
      createdAt: timestamp
    });
    
    // Add to recipient's received requests
    const receivedRef = ref(secondaryDatabase, `relationships/${toUserId}/receivedRequests/${fromUserId}`);
    await set(receivedRef, {
      status: 'pending',
      createdAt: timestamp
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error sending friend request:', error);
    throw error;
  }
};

/**
 * Accept a friend request
 * @param {string} currentUserId - Current user's ID (acceptor)
 * @param {string} fromUserId - Sender's user ID
 */
export const acceptFriendRequest = async (currentUserId, fromUserId, currentUsername = null) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Remove from received requests
    const receivedRef = ref(secondaryDatabase, `relationships/${currentUserId}/receivedRequests/${fromUserId}`);
    await remove(receivedRef);
    
    // Remove from sender's sent requests
    const sentRef = ref(secondaryDatabase, `relationships/${fromUserId}/sentRequests/${currentUserId}`);
    await remove(sentRef);
    
    // Add to both users' friends list
    const myFriendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${fromUserId}`);
    await set(myFriendRef, {
      status: 'active',
      since: timestamp,
      chatEnabled: true
    });
    
    const theirFriendRef = ref(secondaryDatabase, `relationships/${fromUserId}/friends/${currentUserId}`);
    await set(theirFriendRef, {
      status: 'active',
      since: timestamp,
      chatEnabled: true
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error accepting friend request:', error);
    throw error;
  }
};

/**
 * Decline a friend request
 * @param {string} currentUserId - Current user's ID
 * @param {string} fromUserId - Sender's user ID
 */
export const declineFriendRequest = async (currentUserId, fromUserId) => {
  try {
    // Remove from received requests
    const receivedRef = ref(secondaryDatabase, `relationships/${currentUserId}/receivedRequests/${fromUserId}`);
    await remove(receivedRef);
    
    // Remove from sender's sent requests
    const sentRef = ref(secondaryDatabase, `relationships/${fromUserId}/sentRequests/${currentUserId}`);
    await remove(sentRef);
    
    return { success: true };
  } catch (error) {
    console.error('Error declining friend request:', error);
    throw error;
  }
};

/**
 * Cancel a sent friend request
 * @param {string} currentUserId - Current user's ID
 * @param {string} toUserId - Recipient's user ID
 */
export const cancelFriendRequest = async (currentUserId, toUserId) => {
  try {
    // Remove from sent requests
    const sentRef = ref(secondaryDatabase, `relationships/${currentUserId}/sentRequests/${toUserId}`);
    await remove(sentRef);
    
    // Remove from recipient's received requests
    const receivedRef = ref(secondaryDatabase, `relationships/${toUserId}/receivedRequests/${currentUserId}`);
    await remove(receivedRef);
    
    return { success: true };
  } catch (error) {
    console.error('Error canceling friend request:', error);
    throw error;
  }
};

/**
 * Unfollow/Remove a friend
 * @param {string} currentUserId - Current user's ID (who is unfollowing)
 * @param {string} friendUserId - Friend's user ID (who is being unfollowed)
 */
export const unfollowFriend = async (currentUserId, friendUserId) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Update status to unfollowed for current user - mark who unfollowed
    const myFriendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${friendUserId}`);
    await update(myFriendRef, {
      status: 'unfollowed',
      chatEnabled: false,
      unfollowedAt: timestamp,
      unfollowedBy: currentUserId // Track who initiated the unfollow
    });
    
    // Update status for the other user too - they were unfollowed by current user
    const theirFriendRef = ref(secondaryDatabase, `relationships/${friendUserId}/friends/${currentUserId}`);
    await update(theirFriendRef, {
      status: 'unfollowed',
      chatEnabled: false,
      unfollowedAt: timestamp,
      unfollowedBy: currentUserId // Track who initiated the unfollow
    });
    
    return { success: true, unfollowedBy: currentUserId };
  } catch (error) {
    console.error('Error unfollowing friend:', error);
    throw error;
  }
};

/**
 * Remove friend completely (delete from list)
 * @param {string} currentUserId - Current user's ID
 * @param {string} friendUserId - Friend's user ID
 */
export const removeFriend = async (currentUserId, friendUserId) => {
  try {
    // Remove from both users' friends list
    const myFriendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${friendUserId}`);
    await remove(myFriendRef);
    
    const theirFriendRef = ref(secondaryDatabase, `relationships/${friendUserId}/friends/${currentUserId}`);
    await remove(theirFriendRef);
    
    return { success: true };
  } catch (error) {
    console.error('Error removing friend:', error);
    throw error;
  }
};

/**
 * Get relationship status between two users
 * @param {string} currentUserId - Current user's ID
 * @param {string} otherUserId - Other user's ID
 */
export const getRelationshipStatus = async (currentUserId, otherUserId) => {
  try {
    // Check if they are friends
    const friendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${otherUserId}`);
    const friendSnap = await get(friendRef);
    
    if (friendSnap.exists()) {
      const friendData = friendSnap.val();
      if (friendData.status === 'active') {
        return RELATIONSHIP_STATUS.FRIENDS;
      } else if (friendData.status === 'unfollowed') {
        return RELATIONSHIP_STATUS.UNFOLLOWED;
      }
    }
    
    // Check if there's a pending sent request
    const sentRef = ref(secondaryDatabase, `relationships/${currentUserId}/sentRequests/${otherUserId}`);
    const sentSnap = await get(sentRef);
    
    if (sentSnap.exists()) {
      return RELATIONSHIP_STATUS.PENDING_SENT;
    }
    
    // Check if there's a pending received request
    const receivedRef = ref(secondaryDatabase, `relationships/${currentUserId}/receivedRequests/${otherUserId}`);
    const receivedSnap = await get(receivedRef);
    
    if (receivedSnap.exists()) {
      return RELATIONSHIP_STATUS.PENDING_RECEIVED;
    }
    
    return RELATIONSHIP_STATUS.NONE;
  } catch (error) {
    console.error('Error getting relationship status:', error);
    return RELATIONSHIP_STATUS.NONE;
  }
};

/**
 * Get detailed relationship info including who unfollowed
 * @param {string} currentUserId - Current user's ID
 * @param {string} otherUserId - Other user's ID
 */
export const getRelationshipDetails = async (currentUserId, otherUserId) => {
  try {
    const friendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${otherUserId}`);
    const friendSnap = await get(friendRef);
    
    if (!friendSnap.exists()) {
      return { status: RELATIONSHIP_STATUS.NONE, unfollowedBy: null };
    }
    
    const friendData = friendSnap.val();
    return {
      status: friendData.status === 'active' ? RELATIONSHIP_STATUS.FRIENDS : RELATIONSHIP_STATUS.UNFOLLOWED,
      unfollowedBy: friendData.unfollowedBy || null,
      unfollowedAt: friendData.unfollowedAt || null,
      since: friendData.since || null,
      chatEnabled: friendData.chatEnabled || false
    };
  } catch (error) {
    console.error('Error getting relationship details:', error);
    return { status: RELATIONSHIP_STATUS.NONE, unfollowedBy: null };
  }
};

/**
 * Get all friends for a user
 * @param {string} userId - User's ID
 * @param {boolean} activeOnly - Only return active friends
 */
export const getFriends = async (userId, activeOnly = true) => {
  try {
    const friendsRef = ref(secondaryDatabase, `relationships/${userId}/friends`);
    const snapshot = await get(friendsRef);
    
    if (!snapshot.exists()) return [];
    
    const friends = snapshot.val();
    const friendsList = Object.entries(friends)
      .filter(([, data]) => !activeOnly || data.status === 'active')
      .map(([friendId, data]) => ({
        id: friendId,
        ...data
      }));
    
    return friendsList;
  } catch (error) {
    console.error('Error getting friends:', error);
    return [];
  }
};

/**
 * Get all pending received friend requests
 * @param {string} userId - User's ID
 */
export const getReceivedRequests = async (userId) => {
  try {
    const requestsRef = ref(secondaryDatabase, `relationships/${userId}/receivedRequests`);
    const snapshot = await get(requestsRef);
    
    if (!snapshot.exists()) return [];
    
    const requests = snapshot.val();
    return Object.entries(requests).map(([fromUserId, data]) => ({
      fromUserId,
      ...data
    }));
  } catch (error) {
    console.error('Error getting received requests:', error);
    return [];
  }
};

/**
 * Get all pending sent friend requests
 * @param {string} userId - User's ID
 */
export const getSentRequests = async (userId) => {
  try {
    const requestsRef = ref(secondaryDatabase, `relationships/${userId}/sentRequests`);
    const snapshot = await get(requestsRef);
    
    if (!snapshot.exists()) return [];
    
    const requests = snapshot.val();
    return Object.entries(requests).map(([toUserId, data]) => ({
      toUserId,
      ...data
    }));
  } catch (error) {
    console.error('Error getting sent requests:', error);
    return [];
  }
};

/**
 * Get count of pending received friend requests
 * @param {string} userId - User's ID
 */
export const getReceivedRequestsCount = async (userId) => {
  try {
    const requests = await getReceivedRequests(userId);
    return requests.length;
  } catch (error) {
    console.error('Error getting requests count:', error);
    return 0;
  }
};

/**
 * Subscribe to received friend requests (real-time)
 * @param {string} userId - User's ID
 * @param {Function} callback - Callback with requests array
 */
export const subscribeToReceivedRequests = (userId, callback) => {
  const requestsRef = ref(secondaryDatabase, `relationships/${userId}/receivedRequests`);
  
  const handleData = (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const requests = snapshot.val();
    const requestsList = Object.entries(requests).map(([fromUserId, data]) => ({
      fromUserId,
      ...data
    }));
    callback(requestsList);
  };
  
  onValue(requestsRef, handleData);
  
  return () => off(requestsRef);
};

/**
 * Subscribe to friends list (real-time)
 * @param {string} userId - User's ID
 * @param {Function} callback - Callback with friends array
 */
export const subscribeToFriends = (userId, callback) => {
  const friendsRef = ref(secondaryDatabase, `relationships/${userId}/friends`);
  
  const handleData = (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const friends = snapshot.val();
    const friendsList = Object.entries(friends)
      .filter(([, data]) => data.status === 'active')
      .map(([friendId, data]) => ({
        id: friendId,
        ...data
      }));
    callback(friendsList);
  };
  
  onValue(friendsRef, handleData);
  
  return () => off(friendsRef);
};

/**
 * Check if chat is enabled between two users
 * @param {string} currentUserId - Current user's ID
 * @param {string} otherUserId - Other user's ID
 */
export const isChatEnabled = async (currentUserId, otherUserId) => {
  try {
    const friendRef = ref(secondaryDatabase, `relationships/${currentUserId}/friends/${otherUserId}`);
    const snapshot = await get(friendRef);
    
    if (!snapshot.exists()) return false;
    
    const friendData = snapshot.val();
    return friendData.status === 'active' && friendData.chatEnabled === true;
  } catch (error) {
    console.error('Error checking chat enabled:', error);
    return false;
  }
};

/**
 * Get friends with user details
 * @param {string} userId - User's ID
 */
export const getFriendsWithDetails = async (userId) => {
  try {
    const friends = await getFriends(userId, true);
    if (friends.length === 0) return [];
    
    // Get user details from primary database
    const { database, ref: primaryRef, get: primaryGet } = await import('./firebase');
    
    const friendsWithDetails = await Promise.all(
      friends.map(async (friend) => {
        try {
          const userRef = primaryRef(database, `users/${friend.id}`);
          const userSnap = await primaryGet(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.val();
            return {
              ...friend,
              username: userData.username,
              email: userData.email,
              photo_url: userData.photo_url || '',
              verified: userData.verified || false
            };
          }
          return friend;
        } catch {
          return friend;
        }
      })
    );
    
    return friendsWithDetails;
  } catch (error) {
    console.error('Error getting friends with details:', error);
    return [];
  }
};

/**
 * Search friends by username
 * @param {string} userId - User's ID
 * @param {string} searchQuery - Search term
 */
export const searchFriends = async (userId, searchQuery) => {
  try {
    const friends = await getFriendsWithDetails(userId);
    const query = searchQuery.toLowerCase().trim();
    
    return friends.filter(friend =>
      friend.username?.toLowerCase().includes(query) ||
      friend.email?.toLowerCase().includes(query)
    );
  } catch (error) {
    console.error('Error searching friends:', error);
    return [];
  }
};


/**
 * Get suggested friends based on mutual connections
 * @param {string} userId - Current user's ID
 * @param {number} limit - Maximum number of suggestions (default 10)
 * @returns {Promise<Array>} Array of suggested users with mutual friend count
 */
export const getSuggestedFriends = async (userId, limit = 10) => {
  try {
    // Get current user's friends
    const myFriends = await getFriends(userId);
    const myFriendIds = new Set(myFriends.map(f => f.id));
    
    // Get sent and received requests to exclude
    const [sentRequests, receivedRequests] = await Promise.all([
      getSentRequests(userId),
      getReceivedRequests(userId)
    ]);
    const pendingIds = new Set([
      ...sentRequests.map(r => r.toUserId),
      ...receivedRequests.map(r => r.fromUserId)
    ]);
    
    // Track potential friends and their mutual connections
    const suggestionsMap = new Map(); // userId -> { user, mutualCount, mutualFriends }
    
    // For each of my friends, get their friends (friends of friends)
    await Promise.all(
      myFriends.map(async (friend) => {
        try {
          const friendsOfFriend = await getFriendsWithDetails(friend.id);
          
          friendsOfFriend.forEach(fof => {
            // Skip if: it's me, already my friend, or has pending request
            if (fof.id === userId || myFriendIds.has(fof.id) || pendingIds.has(fof.id)) {
              return;
            }
            
            // Add or update suggestion
            if (suggestionsMap.has(fof.id)) {
              const existing = suggestionsMap.get(fof.id);
              existing.mutualCount += 1;
              existing.mutualFriends.push(friend.username);
            } else {
              suggestionsMap.set(fof.id, {
                ...fof,
                mutualCount: 1,
                mutualFriends: [friend.username]
              });
            }
          });
        } catch (e) {
          // Skip if error getting this friend's friends
        }
      })
    );
    
    // Convert to array and sort by mutual count (highest first)
    let suggestions = Array.from(suggestionsMap.values())
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, limit);
    
    // If we don't have enough suggestions, add some random users
    if (suggestions.length < limit) {
      try {
        const allUsers = await getAllUsersForSearch();
        const existingIds = new Set([
          userId,
          ...myFriendIds,
          ...pendingIds,
          ...suggestions.map(s => s.id)
        ]);
        
        const randomUsers = allUsers
          .filter(u => !existingIds.has(u.id))
          .slice(0, limit - suggestions.length)
          .map(u => ({
            ...u,
            mutualCount: 0,
            mutualFriends: []
          }));
        
        suggestions = [...suggestions, ...randomUsers];
      } catch (e) {
        // Ignore random users fetch error
      }
    }
    
    return suggestions;
  } catch (error) {
    console.error('Error getting suggested friends:', error);
    return [];
  }
};

