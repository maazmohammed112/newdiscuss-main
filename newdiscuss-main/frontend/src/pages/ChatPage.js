import UserAvatar from '@/components/UserAvatar';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHighlights } from '@/contexts/HighlightsContext';
import { getUser } from '@/lib/db';
import { database, ref, onValue } from '@/lib/firebase';
import { getChatsWithUserDetails, subscribeToUserChats, getUserChats, getChatSettings } from '@/lib/chatsDb';
import { getFriendsWithDetails, searchFriends } from '@/lib/relationshipsDb';
import { 
  getUserGroups, 
  subscribeToUserGroups, 
  GROUP_STATUS,
  searchPublicGroups,
  sendJoinRequest,
  getUserJoinRequestStatus,
  cancelJoinRequest
} from '@/lib/groupsDb';
import { 
  getCachedChats, 
  cacheChats, 
  getCachedFriends, 
  cacheFriends,
  getCachedGroups,
  cacheGroups
} from '@/lib/cacheManager';
import Header from '@/components/Header';
import VerifiedBadge from '@/components/VerifiedBadge';
import CreateGroupModal from '@/components/CreateGroupModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, Search, X, MessageCircle, Users, Loader2, 
  MessageSquarePlus, Timer, MoreVertical, UserPlus, Inbox, Globe
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  previewFromLastMessageString,
  isDeletedListPreview,
} from '@/lib/chatMessageUtils';

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pendingGroupRequests } = useHighlights();
  const [chats, setChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'friends'
  const [chatSettings, setChatSettings] = useState({});
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [searchGroupsOpen, setSearchGroupsOpen] = useState(false);
  const [publicGroups, setPublicGroups] = useState([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [searchingGroups, setSearchingGroups] = useState(false);
  const [groupRequestStatus, setGroupRequestStatus] = useState({});

  // Load chats, groups and friends with user details inline - with caching
  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        // Try to get cached data first for instant loading
        const [cachedChatsData, cachedFriendsData, cachedGroupsData] = await Promise.all([
          getCachedChats(user.id),
          getCachedFriends(user.id),
          getCachedGroups(user.id)
        ]);

        if (cachedChatsData?.length > 0) {
          setChats(cachedChatsData);
        }
        if (cachedFriendsData?.length > 0) {
          setFriends(cachedFriendsData);
        }
        if (cachedGroupsData?.length > 0) {
          setGroups(cachedGroupsData);
        }
        if (
          (cachedChatsData && cachedChatsData.length > 0) ||
          (cachedFriendsData && cachedFriendsData.length > 0) ||
          (cachedGroupsData && cachedGroupsData.length > 0)
        ) {
          setLoading(false);
        }

        // Get raw chats first
        const rawChats = await getUserChats(user.id);
        
        // Fetch user details for each chat
        const chatsWithDetails = await Promise.all(
          rawChats.map(async (chat) => {
            try {
              if (!chat.otherUser) return null;
              
              const userData = await getUser(chat.otherUser);
              
              if (!userData || !userData.username) {
                console.warn('Skipping chat with invalid user:', chat.otherUser);
                return null;
              }
              
              // Get chat settings for auto-delete indicator
              const settings = await getChatSettings(chat.chatId);
              if (settings?.autoDelete) {
                setChatSettings(prev => ({ ...prev, [chat.chatId]: settings }));
              }
              
              return {
                ...chat,
                otherUserDetails: {
                  id: chat.otherUser,
                  username: userData.username,
                  email: userData.email || '',
                  photo_url: userData.photo_url || '',
                  verified: userData.verified || false
                }
              };
            } catch (err) {
              console.error('Error fetching user:', err);
              return null;
            }
          })
        );
        
        // Filter out null values (invalid chats)
        const validChats = chatsWithDetails.filter(chat => chat !== null && chat.otherUserDetails !== null);
        
        setChats(validChats);
        await cacheChats(user.id, validChats);
        
        // Load friends
        const friendsData = await getFriendsWithDetails(user.id);
        setFriends(friendsData);
        await cacheFriends(user.id, friendsData);
        
        // Load groups
        const groupsData = await getUserGroups(user.id);
        setGroups(groupsData);
        await cacheGroups(user.id, groupsData);
        
      } catch (error) {
        console.error('Error loading chat data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time chat updates
    const unsubscribeChats = subscribeToUserChats(user.id, async (updatedChats) => {
      const chatsWithDetails = await Promise.all(
        updatedChats.map(async (chat) => {
          try {
            if (!chat.otherUser) return null;
            
            const userData = await getUser(chat.otherUser);
            
            if (!userData || !userData.username) {
              return null;
            }
            
            return {
              ...chat,
              otherUserDetails: {
                id: chat.otherUser,
                username: userData.username,
                email: userData.email || '',
                photo_url: userData.photo_url || '',
                verified: userData.verified || false
              }
            };
          } catch {
            return null;
          }
        })
      );
      
      const validChats = chatsWithDetails.filter(chat => chat !== null && chat.otherUserDetails !== null);
      setChats(validChats);
      cacheChats(user.id, validChats);
    });

    // Subscribe to real-time group updates
    const unsubscribeGroups = subscribeToUserGroups(user.id, (updatedGroups) => {
      setGroups(updatedGroups);
      cacheGroups(user.id, updatedGroups);
    });

    return () => {
      unsubscribeChats();
      unsubscribeGroups();
    };
  }, [user?.id]);

  // Drop 1:1 chats in real time if the peer profile is removed from primary RTDB
  const chatPeerIdsKey = chats
    .map((c) => c.otherUser)
    .filter(Boolean)
    .sort()
    .join(',');
  useEffect(() => {
    if (!user?.id || !chatPeerIdsKey) return;
    const seenOk = new Set();
    const ids = [...new Set(chatPeerIdsKey.split(',').filter(Boolean))];
    const unsubs = ids.map((oid) =>
      onValue(ref(database, `users/${oid}`), (snap) => {
        if (snap.exists()) {
          seenOk.add(oid);
          return;
        }
        if (!seenOk.has(oid)) return;
        setChats((prev) => {
          const next = prev.filter((c) => c.otherUser !== oid);
          if (next.length < prev.length) {
            cacheChats(user.id, next);
            toast.info('Chat removed — user no longer on Discuss');
          }
          return next;
        });
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [chatPeerIdsKey, user?.id]);

  // Drop friends from the list when their profile is deleted
  const friendIdsKey = friends
    .map((f) => f.id)
    .filter(Boolean)
    .sort()
    .join(',');
  useEffect(() => {
    if (!user?.id || !friendIdsKey) return;
    const seenOk = new Set();
    const ids = [...new Set(friendIdsKey.split(',').filter(Boolean))];
    const unsubs = ids.map((fid) =>
      onValue(ref(database, `users/${fid}`), (snap) => {
        if (snap.exists()) {
          seenOk.add(fid);
          return;
        }
        if (!seenOk.has(fid)) return;
        setFriends((prev) => {
          const next = prev.filter((f) => f.id !== fid);
          if (next.length < prev.length) {
            cacheFriends(user.id, next);
            toast.info('A friend was removed from Discuss');
          }
          return next;
        });
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [friendIdsKey, user?.id]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim() || !user?.id) {
      setSearchResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setSearching(true);
      try {
        if (activeTab === 'friends') {
          const results = await searchFriends(user.id, searchQuery);
          setSearchResults(results);
        } else {
          // Search in both chats and groups
          const chatResults = chats.filter(chat =>
            chat.otherUserDetails?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
          );
          const groupResults = groups.filter(group =>
            group.groupName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            group.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
          );
          setSearchResults([...chatResults, ...groupResults]);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [searchQuery, user?.id, activeTab, chats, groups]);

  const handleChatClick = (otherUserId) => {
    navigate(`/chat/${otherUserId}`);
  };

  const handleGroupClick = (groupId) => {
    navigate(`/group/${groupId}`);
  };

  const handleStartNewChat = (friendId) => {
    navigate(`/chat/${friendId}`);
  };

  const handleGroupCreated = (group) => {
    // Reload groups
    getUserGroups(user.id).then(groupsData => {
      setGroups(groupsData);
      cacheGroups(user.id, groupsData);
    });
    // Navigate to the new group
    navigate(`/group/${group.id}`);
  };

  const handleSearchGroups = async (query) => {
    if (!query.trim()) {
      setPublicGroups([]);
      return;
    }
    
    setSearchingGroups(true);
    try {
      const results = await searchPublicGroups(query);
      setPublicGroups(results);
      
      // Check request status for each group
      const statuses = {};
      for (const group of results) {
        const status = await getUserJoinRequestStatus(group.id, user.id);
        statuses[group.id] = status;
      }
      setGroupRequestStatus(statuses);
    } catch (error) {
      console.error('Error searching groups:', error);
    } finally {
      setSearchingGroups(false);
    }
  };

  const handleJoinRequest = async (groupId) => {
    try {
      await sendJoinRequest(groupId, user.id);
      setGroupRequestStatus({ ...groupRequestStatus, [groupId]: 'pending' });
      toast.success('Join request sent');
    } catch (error) {
      toast.error('Failed to send request');
    }
  };

  const handleCancelRequest = async (groupId) => {
    try {
      await cancelJoinRequest(groupId, user.id);
      setGroupRequestStatus({ ...groupRequestStatus, [groupId]: 'cancelled' });
      toast.success('Request cancelled');
    } catch (error) {
      toast.error('Failed to cancel request');
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const renderChatItem = (chat) => {
    const otherUser = chat.otherUserDetails;
    
    if (!otherUser || !otherUser.username) {
      return null;
    }
    
    const initials = otherUser.username.slice(0, 2).toUpperCase();
    const isBlocked = chat.status === 'blocked';
    const hasAutoDelete = chatSettings[chat.chatId]?.autoDelete;
    // Don't show unread for deleted messages
    const isDeletedMessage = isDeletedListPreview(chat.lastMessage);
    const hasUnread = chat.unreadCount > 0 && !isBlocked && !isDeletedMessage;
    const displayMessage = previewFromLastMessageString(
      chat.lastMessage,
      isBlocked,
      false
    );

    return (
      <button
        key={chat.chatId}
        onClick={() => handleChatClick(chat.otherUser)}
        className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all ${
          isBlocked 
            ? 'bg-neutral-50/50 dark:bg-neutral-800/50 discuss:bg-[#1a1a1a]/50 opacity-60'
            : hasUnread
              ? 'bg-[#2563EB]/5 dark:bg-[#2563EB]/10 discuss:bg-[#EF4444]/10 border-[#2563EB]/30 dark:border-[#2563EB]/30 discuss:border-[#EF4444]/30'
              : 'bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] hover:shadow-card-hover dark:hover:shadow-none'
        } border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] ${hasUnread ? 'ring-1 ring-[#2563EB]/20 discuss:ring-[#EF4444]/20' : ''} shadow-card`}
      >
        <div className="relative shrink-0">
          <UserAvatar
            src={otherUser.photo_url}
            username={otherUser.username}
            className="w-12 h-12"
          />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shadow-sm">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className={`font-semibold text-sm truncate ${hasUnread ? 'text-neutral-900 dark:text-white discuss:text-white' : 'text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]'}`}>
                @{otherUser.username}
              </span>
              {otherUser.verified && <VerifiedBadge size="sm" />}
              {hasAutoDelete && (
                <span className="bg-[#F59E0B]/20 text-[#F59E0B] text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title="Auto-delete enabled (24h)">
                  <Timer className="w-2.5 h-2.5" />
                  24h
                </span>
              )}
            </div>
            <span className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs shrink-0">
              {formatTime(chat.lastMessageTime)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={`text-xs truncate ${isDeletedMessage ? 'italic text-neutral-400 dark:text-neutral-500' : ''} ${hasUnread ? 'text-neutral-900 dark:text-neutral-200 discuss:text-[#E5E7EB] font-medium' : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]'}`}>
              {displayMessage}
            </p>
          </div>
        </div>
      </button>
    );
  };

  const renderGroupItem = (group) => {
    const isDeleted = group.status === GROUP_STATUS.DELETED;
    // Don't show unread for deleted messages
    const isDeletedMessage = isDeletedListPreview(group.lastMessage);
    const hasUnread = group.unreadCount > 0 && !isDeleted && !isDeletedMessage;
    const initials = group.groupName?.slice(0, 2).toUpperCase() || 'GR';
    const displayMessage = previewFromLastMessageString(
      group.lastMessage,
      false,
      isDeleted
    );

    return (
      <button
        key={group.groupId}
        onClick={() => handleGroupClick(group.groupId)}
        className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all ${
          isDeleted 
            ? 'bg-neutral-50/50 dark:bg-neutral-800/50 discuss:bg-[#1a1a1a]/50 opacity-60'
            : hasUnread
              ? 'bg-[#2563EB]/5 dark:bg-[#2563EB]/10 discuss:bg-[#EF4444]/10 border-[#2563EB]/30 dark:border-[#2563EB]/30 discuss:border-[#EF4444]/30'
              : 'bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] hover:shadow-card-hover dark:hover:shadow-none'
        } border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] ${hasUnread ? 'ring-1 ring-[#2563EB]/20 discuss:ring-[#EF4444]/20' : ''} shadow-card`}
      >
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">{initials}</span>
          </div>
          {hasUnread && (
            <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shadow-sm">
              {group.unreadCount > 99 ? '99+' : group.unreadCount}
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-semibold text-sm truncate ${hasUnread ? 'text-neutral-900 dark:text-white discuss:text-white' : 'text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]'}`}>
                {group.groupName}
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-purple-100 dark:bg-purple-900/30 discuss:bg-purple-900/30 text-purple-700 dark:text-purple-300 discuss:text-purple-300"
                style={document.documentElement.classList.contains('discuss-black')
                  ? { backgroundColor: 'rgba(112,0,255,0.18)', color: '#C084FC' }
                  : {}}
              >
                Group Chat
              </span>
            </div>
            <span className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs shrink-0">
              {formatTime(group.lastMessageTime || group.joinedAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className={`text-xs truncate ${isDeletedMessage ? 'italic text-neutral-400 dark:text-neutral-500' : ''} ${hasUnread ? 'text-neutral-900 dark:text-neutral-200 discuss:text-[#E5E7EB] font-medium' : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]'}`}>
              {displayMessage}
            </p>
          </div>
        </div>
      </button>
    );
  };

  const renderFriendItem = (friend) => {
    const initials = (friend.username || 'U').slice(0, 2).toUpperCase();

    return (
      <button
        key={friend.id}
        onClick={() => handleStartNewChat(friend.id)}
        className="w-full flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] hover:shadow-card-hover dark:hover:shadow-none transition-all border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] shadow-card"
      >
        <UserAvatar
          src={friend.photo_url}
          username={friend.username}
          className="w-12 h-12 shrink-0"
        />
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] text-sm truncate">
              @{friend.username}
            </span>
            {friend.verified && <VerifiedBadge size="sm" />}
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs">
            Friends since {new Date(friend.since).toLocaleDateString([], { month: 'short', year: 'numeric' })}
          </p>
        </div>

        <MessageSquarePlus className="w-5 h-5 text-[#2563EB] discuss:text-[#EF4444] shrink-0" />
      </button>
    );
  };

  // Combine and sort chats and groups by last message time
  const combinedChatsAndGroups = [
    ...chats.map(c => ({ ...c, type: 'chat' })),
    ...groups.map(g => ({ ...g, type: 'group' }))
  ].sort((a, b) => {
    const timeA = new Date(a.lastMessageTime || a.joinedAt || 0);
    const timeB = new Date(b.lastMessageTime || b.joinedAt || 0);
    return timeB - timeA;
  });

  const displayData = searchQuery.trim() 
    ? searchResults 
    : (activeTab === 'chats' ? combinedChatsAndGroups : friends);

  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0) + 
                      groups.reduce((sum, g) => sum + (g.unreadCount || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        {/* Header with three-dot menu */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/feed')}
            className="p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-heading text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] flex-1">
            Messages
          </h1>
          
          {/* Three-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]">
                <MoreVertical className="w-5 h-5" />
                {pendingGroupRequests > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-neutral-50 dark:border-neutral-900 discuss:border-[#121212]"></span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Group
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSearchGroupsOpen(true)}>
                <Globe className="w-4 h-4 mr-2" />
                Search Public Groups
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/join-requests')} className="relative">
                <Inbox className="w-4 h-4 mr-2" />
                View / Manage Requests
                {pendingGroupRequests > 0 && (
                  <span className="ml-auto w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tabs */}
        <div className="flex mb-4 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] p-1 border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] shadow-card">
          <button
            onClick={() => { setActiveTab('chats'); setSearchQuery(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[6px] text-[13px] font-semibold transition-all ${
              activeTab === 'chats'
                ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white shadow-button'
                : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5]'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Chats
            {totalUnread > 0 && (
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('friends'); setSearchQuery(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[6px] text-[13px] font-semibold transition-all ${
              activeTab === 'friends'
                ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white shadow-button'
                : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5]'
            }`}
          >
            <Users className="w-4 h-4" />
            Friends
            <span className="bg-neutral-100 dark:bg-neutral-700 discuss:bg-[#333333] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[10px] px-1.5 py-0.5 rounded-full">
              {friends.length}
            </span>
          </button>
        </div>

        {/* Search bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'chats' ? 'Search chats and groups...' : 'Search friends...'}
              className="pl-10 pr-10 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 discuss:placeholder:text-[#9CA3AF] rounded-[6px] text-sm h-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-2 py-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] mb-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#2563EB] discuss:text-[#EF4444]" />
              {activeTab === 'chats' ? 'Syncing chats…' : 'Loading friends…'}
            </p>
            {(activeTab === 'chats' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4]).map((i) => (
              <div
                key={i}
                className="w-full flex items-center gap-3 p-3 rounded-[12px] bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] animate-pulse"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] rounded" />
                  <div className="h-2 w-2/3 bg-neutral-100 dark:bg-neutral-600 discuss:bg-[#262626] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : displayData.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] shadow-card">
            {searchQuery ? (
              <>
                <Search className="w-10 h-10 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF] mx-auto mb-3" />
                <h3 className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-semibold mb-1">
                  No results found
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">
                  Try a different search term
                </p>
              </>
            ) : activeTab === 'chats' ? (
              <>
                <MessageCircle className="w-10 h-10 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF] mx-auto mb-3" />
                <h3 className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-semibold mb-1">
                  No chats yet
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm mb-4">
                  Start a conversation with friends or create a group
                </p>
                <div className="flex gap-2 justify-center">
                  {friends.length > 0 && (
                    <Button
                      onClick={() => setActiveTab('friends')}
                      className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white rounded-[6px] shadow-button"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      View Friends
                    </Button>
                  )}
                  <Button
                    onClick={() => setCreateGroupOpen(true)}
                    variant="outline"
                    className="border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] rounded-[6px]"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Group
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Users className="w-10 h-10 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF] mx-auto mb-3" />
                <h3 className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-semibold mb-1">
                  No friends yet
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm mb-4">
                  Find people to connect with
                </p>
                <Button
                  onClick={() => navigate('/profile')}
                  className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white rounded-[6px] shadow-button"
                >
                  Find Friends
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2 scrollbar-hide" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {activeTab === 'chats'
              ? displayData.map(item => 
                  item.type === 'group' 
                    ? renderGroupItem(item) 
                    : renderChatItem(item)
                ).filter(Boolean)
              : displayData.map(renderFriendItem).filter(Boolean)
            }
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        userId={user?.id}
        onGroupCreated={handleGroupCreated}
      />

      {/* Search Public Groups Dialog */}
      <Dialog open={searchGroupsOpen} onOpenChange={setSearchGroupsOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a]">
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
              Search Public Groups
            </DialogTitle>
            <DialogDescription className="text-neutral-500 dark:text-neutral-400">
              Find and join public groups
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                value={groupSearchQuery}
                onChange={(e) => {
                  setGroupSearchQuery(e.target.value);
                  handleSearchGroups(e.target.value);
                }}
                placeholder="Search groups..."
                className="pl-10 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a]"
              />
            </div>
            
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {searchingGroups ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#2563EB] discuss:text-[#EF4444]" />
                </div>
              ) : publicGroups.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                  {groupSearchQuery ? 'No groups found' : 'Type to search public groups'}
                </div>
              ) : (
                publicGroups.map(group => (
                  <div
                    key={group.id}
                    className="p-3 bg-neutral-50 dark:bg-neutral-700 discuss:bg-[#262626] rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {group.name?.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
                          {group.name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {group.memberCount || 0} members
                        </p>
                      </div>
                    </div>
                    
                    {groupRequestStatus[group.id] === 'pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelRequest(group.id)}
                        className="text-xs"
                      >
                        Cancel Request
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleJoinRequest(group.id)}
                        className="bg-[#2563EB] discuss:bg-[#EF4444] text-white text-xs"
                      >
                        Request to Join
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
