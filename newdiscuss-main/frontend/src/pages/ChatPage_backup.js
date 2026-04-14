import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUser } from '@/lib/db';
import { getChatsWithUserDetails, subscribeToUserChats, getUserChats, getChatSettings } from '@/lib/chatsDb';
import { getFriendsWithDetails, searchFriends } from '@/lib/relationshipsDb';
import { 
  getCachedChats, 
  cacheChats, 
  getCachedFriends, 
  cacheFriends 
} from '@/lib/cacheManager';
import Header from '@/components/Header';
import VerifiedBadge from '@/components/VerifiedBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, Search, X, MessageCircle, Users, Loader2, 
  MessageSquarePlus, Clock, Timer
} from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'friends'
  const [chatSettings, setChatSettings] = useState({});

  // Load chats and friends with user details inline - with caching
  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        // Try to get cached data first for instant loading
        const [cachedChatsData, cachedFriendsData] = await Promise.all([
          getCachedChats(user.id),
          getCachedFriends(user.id)
        ]);

        // If we have cached data, show it immediately
        if (cachedChatsData && cachedChatsData.length > 0) {
          setChats(cachedChatsData);
          setLoading(false);
        }
        if (cachedFriendsData && cachedFriendsData.length > 0) {
          setFriends(cachedFriendsData);
        }

        // Get raw chats first
        const rawChats = await getUserChats(user.id);
        
        // Fetch user details for each chat
        const chatsWithDetails = await Promise.all(
          rawChats.map(async (chat) => {
            try {
              if (!chat.otherUser) return null; // Skip chats without otherUser
              
              const userData = await getUser(chat.otherUser);
              
              // Skip if user doesn't exist or is invalid
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
              return null; // Skip chats with errors
            }
          })
        );
        
        // Filter out null values (invalid chats)
        const validChats = chatsWithDetails.filter(chat => chat !== null && chat.otherUserDetails !== null);
        
        setChats(validChats);
        // Cache the chats data
        await cacheChats(user.id, chatsWithDetails);
        
        // Load friends
        const friendsData = await getFriendsWithDetails(user.id);
        setFriends(friendsData);
        // Cache the friends data
        await cacheFriends(user.id, friendsData);
      } catch (error) {
        console.error('Error loading chat data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time chat updates
    const unsubscribe = subscribeToUserChats(user.id, async (updatedChats) => {
      // Fetch user details for updated chats
      const chatsWithDetails = await Promise.all(
        updatedChats.map(async (chat) => {
          try {
            if (!chat.otherUser) return null;
            
            const userData = await getUser(chat.otherUser);
            
            // Skip if user doesn't exist or is invalid
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
      
      // Filter out null values
      const validChats = chatsWithDetails.filter(chat => chat !== null && chat.otherUserDetails !== null);
      setChats(validChats);
    });

    return () => unsubscribe();
  }, [user?.id]);

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
          // Search in chats
          const filtered = chats.filter(chat =>
            chat.otherUserDetails?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
          );
          setSearchResults(filtered);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [searchQuery, user?.id, activeTab, chats]);

  const handleChatClick = (otherUserId) => {
    navigate(`/chat/${otherUserId}`);
  };

  const handleStartNewChat = (friendId) => {
    navigate(`/chat/${friendId}`);
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
    
    // Skip rendering if no valid user details
    if (!otherUser || !otherUser.username) {
      return null;
    }
    
    const initials = otherUser.username.slice(0, 2).toUpperCase();
    const isBlocked = chat.status === 'blocked';
    const hasAutoDelete = chatSettings[chat.chatId]?.autoDelete;
    const hasUnread = chat.unreadCount > 0 && !isBlocked;

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
        {/* Avatar with unread indicator */}
        <div className="relative shrink-0">
          {otherUser.photo_url ? (
            <img referrerPolicy="no-referrer" src={otherUser.photo_url}
              alt={otherUser.username}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center">
              <span className="text-white font-bold">{initials}</span>
            </div>
          )}
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
            <p className={`text-xs truncate ${hasUnread ? 'text-neutral-900 dark:text-neutral-200 discuss:text-[#E5E7EB] font-medium' : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]'}`}>
              {isBlocked ? 'Chat unavailable' : (chat.lastMessage || 'No messages yet')}
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
        {friend.photo_url ? (
          <img referrerPolicy="no-referrer" src={friend.photo_url}
            alt={friend.username}
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center shrink-0">
            <span className="text-white font-bold">{initials}</span>
          </div>
        )}
        
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

  const displayData = searchQuery.trim() ? searchResults : (activeTab === 'chats' ? chats : friends);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        {/* Back button and title */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/feed')}
            className="p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-heading text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
            Messages
          </h1>
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
            {chats.filter(c => c.unreadCount > 0).length > 0 && (
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {chats.filter(c => c.unreadCount > 0).length}
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
              placeholder={activeTab === 'chats' ? 'Search chats...' : 'Search friends...'}
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
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-3" />
            <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm font-medium">
              {activeTab === 'chats' ? 'Loading chats...' : 'Loading friends list...'}
            </p>
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
                  Start a conversation with your friends
                </p>
                {friends.length > 0 && (
                  <Button
                    onClick={() => setActiveTab('friends')}
                    className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white rounded-[6px] shadow-button"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    View Friends
                  </Button>
                )}
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
              ? displayData.map(renderChatItem).filter(Boolean)
              : displayData.map(renderFriendItem).filter(Boolean)
            }
          </div>
        )}
      </div>

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
