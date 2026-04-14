import UserAvatar from '@/components/UserAvatar';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { database, ref, onValue } from '@/lib/firebase';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUser } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfileDb';
import { isChatEnabled, getRelationshipStatus, getRelationshipDetails, RELATIONSHIP_STATUS, unfollowFriend } from '@/lib/relationshipsDb';
import { 
  getOrCreateChat, 
  sendMessage, 
  subscribeToMessages, 
  markMessagesAsRead,
  toggleAutoDelete,
  deleteOldMessages,
  generateChatId,
  deleteChat,
  deleteMessageForMe,
  deleteMessageForEveryone,
  getDeletedMessages,
  sendReplyMessage,
  reportAndRestrictUser,
  runAutoDeleteCleanup,
  subscribeToChatSettings,
  CHAT_STATUS
} from '@/lib/chatsDb';
import {
  getCachedMessages,
  cacheMessages,
  clearDmThreadCaches,
  removeDmMessageFromCaches,
  patchDmMessageDeletedInCaches,
} from '@/lib/cacheManager';
import {
  replyPreviewText,
  DELETED_MESSAGE_PREVIEW,
  isDeletedForEveryone,
} from '@/lib/chatMessageUtils';
import Header from '@/components/Header';
import FriendRequestButton from '@/components/FriendRequestButton';
import VerifiedBadge from '@/components/VerifiedBadge';
import ChatLinkText from '@/components/ChatLinkText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ArrowLeft, Send, Loader2, Lock, MoreVertical, Trash2, User, AlertTriangle, Clock, 
  Copy, X, Reply, Flag, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { notifyChatMessage, isNotificationsEnabled } from '@/lib/pushNotificationService';

export default function ChatConversationPage() {
  const { otherUserId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const messageRefs = useRef({});

  const [otherUser, setOtherUser] = useState(null);
  const [otherUserProfile, setOtherUserProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [deletedMessageIds, setDeletedMessageIds] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [chatStatus, setChatStatus] = useState(CHAT_STATUS.ACTIVE);
  const [relationshipStatus, setRelationshipStatus] = useState(RELATIONSHIP_STATUS.NONE);
  const [unfollowedBy, setUnfollowedBy] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAutoDeleteConfirm, setShowAutoDeleteConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [chatCreated, setChatCreated] = useState(false);
  const [liveMessagesSynced, setLiveMessagesSynced] = useState(false);

  const deletedIdsRef = useRef([]);
  const otherUserRef = useRef(null);
  const userIdRef = useRef(null);
  const prevSeenMessageIdsRef = useRef(new Set());

  // Reply state
  const [replyTo, setReplyTo] = useState(null);

  // Message action states
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [showDeleteMessageConfirm, setShowDeleteMessageConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState(null);

  // Swipe state for reply
  const [swipeStates, setSwipeStates] = useState({});

  // Long press handling
  const longPressTimer = useRef(null);
  const [isLongPress, setIsLongPress] = useState(false);

  useEffect(() => {
    deletedIdsRef.current = deletedMessageIds;
  }, [deletedMessageIds]);

  useEffect(() => {
    otherUserRef.current = otherUser;
  }, [otherUser]);

  useEffect(() => {
    if (!otherUserId) return;
    const uref = ref(database, `users/${otherUserId}`);
    let sawProfile = false;
    const unsub = onValue(uref, (snap) => {
      if (snap.exists()) {
        sawProfile = true;
        return;
      }
      if (sawProfile) {
        toast.error('This user is no longer on Discuss');
        navigate('/chat');
      }
    });
    return () => unsub();
  }, [otherUserId, navigate]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Load other user data and chat
  useEffect(() => {
    if (!user?.id || !otherUserId) return;

    const loadData = async () => {
      try {
        // Run auto-delete cleanup on load
        runAutoDeleteCleanup();

        // Load other user details
        const [userData, profileData] = await Promise.all([
          getUser(otherUserId),
          getUserProfile(otherUserId)
        ]);
        
        if (!userData) {
          console.error('User not found:', otherUserId);
          setLoading(false);
          return;
        }
        
        setOtherUser(userData);
        setOtherUserProfile(profileData);

        // Check relationship and chat status with details
        const [canChat, status, details] = await Promise.all([
          isChatEnabled(user.id, otherUserId),
          getRelationshipStatus(user.id, otherUserId),
          getRelationshipDetails(user.id, otherUserId)
        ]);
        setChatEnabled(canChat);
        setRelationshipStatus(status);
        setUnfollowedBy(details.unfollowedBy);

        // Get or create chat
        const generatedChatId = generateChatId(user.id, otherUserId);
        setChatId(generatedChatId);

        // Load deleted messages for current user
        const deleted = await getDeletedMessages(user.id, generatedChatId);
        setDeletedMessageIds(deleted);

        // If chat is enabled, create it right away to prevent "failed to send" errors
        if (canChat) {
          try {
            await getOrCreateChat(user.id, otherUserId);
            setChatCreated(true);
          } catch (err) {
            console.error('Error creating chat:', err);
          }
        }
      } catch (error) {
        console.error('Error loading chat data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id, otherUserId]);

  useEffect(() => {
    setLiveMessagesSynced(false);
    prevSeenMessageIdsRef.current = new Set();
  }, [chatId]);

  // Subscribe to chat settings
  useEffect(() => {
    if (!chatId) return;
    
    const unsubscribe = subscribeToChatSettings(chatId, (settings) => {
      if (settings) {
        setAutoDeleteEnabled(settings.autoDelete || false);
        if (settings.status) setChatStatus(settings.status);
      } else {
        // Chat deleted or non-existent
        setChatStatus(CHAT_STATUS.DELETED);
      }
    });
    
    return () => unsubscribe();
  }, [chatId]);

  // Subscribe to messages with IndexedDB + localStorage cache
  useEffect(() => {
    if (!chatId || !user?.id) return;

    let unsubscribe = null;
    let cancelled = false;

    (async () => {
      const cached = await getCachedMessages(user.id, chatId);
      if (!cancelled && cached?.length) {
        setMessages(cached);
      }

      unsubscribe = subscribeToMessages(chatId, async (newMessages) => {
        if (cancelled) return;

        const uid = userIdRef.current;
        const seen = prevSeenMessageIdsRef.current;
        const newIncoming = newMessages.filter(
          (m) => m.sender !== uid && !seen.has(m.id)
        );
        newMessages.forEach((m) => seen.add(m.id));

        if (newIncoming.length > 0 && isNotificationsEnabled() && document.hidden) {
          await notifyChatMessage(chatId, otherUserRef.current?.username);
        }

        setMessages(newMessages);
        await cacheMessages(user.id, chatId, newMessages);
        setLiveMessagesSynced(true);
        markMessagesAsRead(chatId, user.id);
      });
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [chatId, user?.id]);

  // Initial scroll to bottom when chat loads
  useEffect(() => {
    if (!loading && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 100);
    }
  }, [loading]);

  // Handle relationship status change
  const handleStatusChange = useCallback((newStatus) => {
    setRelationshipStatus(newStatus);
    if (newStatus === RELATIONSHIP_STATUS.FRIENDS) {
      setChatEnabled(true);
      setChatStatus(CHAT_STATUS.ACTIVE);
    } else if (newStatus === RELATIONSHIP_STATUS.UNFOLLOWED) {
      setChatEnabled(false);
      setChatStatus(CHAT_STATUS.BLOCKED);
    }
  }, []);

  // Ensure chat exists before sending
  const ensureChatExists = async () => {
    if (!chatCreated && chatEnabled) {
      try {
        await getOrCreateChat(user.id, otherUserId);
        setChatCreated(true);
        return true;
      } catch (err) {
        console.error('Failed to create chat:', err);
        return false;
      }
    }
    return true;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || sending || !chatEnabled) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);
    
    try {
      // Ensure chat exists first
      const chatExists = await ensureChatExists();
      if (!chatExists) {
        throw new Error('Failed to create chat');
      }

      if (replyTo) {
        await sendReplyMessage(chatId, user.id, messageText, replyTo);
        setReplyTo(null);
      } else {
        await sendMessage(chatId, user.id, messageText);
      }
      inputRef.current?.focus();
    } catch (error) {
      console.error('Send message error:', error);
      setNewMessage(messageText);
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!chatId) return;
    
    setDeleting(true);
    try {
      await deleteChat(chatId);
      if (user?.id) await clearDmThreadCaches(user.id, chatId);
      toast.success('Chat deleted');
      navigate('/chat');
    } catch (error) {
      toast.error('Failed to delete chat');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleToggleAutoDelete = async () => {
    if (!chatId) return;
    
    try {
      await toggleAutoDelete(chatId, !autoDeleteEnabled);
      setAutoDeleteEnabled(!autoDeleteEnabled);
      setShowAutoDeleteConfirm(false);
      
      if (!autoDeleteEnabled) {
        toast.success('Auto-delete enabled. Messages will be deleted after 24 hours.');
        await deleteOldMessages(chatId, 24);
      } else {
        toast.success('Auto-delete disabled.');
      }
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  // Handle message long press - ONLY triggered on long press, not click
  const handleMessageLongPress = (message) => {
    setSelectedMessage(message);
    setShowMessageOptions(true);
  };

  // Long press handlers
  const handleTouchStart = (message) => {
    setIsLongPress(false);
    longPressTimer.current = setTimeout(() => {
      setIsLongPress(true);
      handleMessageLongPress(message);
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Copy message text
  const handleCopyMessage = async () => {
    if (selectedMessage) {
      try {
        await navigator.clipboard.writeText(selectedMessage.text);
        toast.success('Message copied');
      } catch (err) {
        toast.error('Failed to copy');
      }
    }
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  // Delete message for me
  const handleDeleteForMe = async () => {
    if (!selectedMessage || !chatId) return;
    
    try {
      await deleteMessageForMe(chatId, selectedMessage.id, user.id);
      await removeDmMessageFromCaches(user.id, chatId, selectedMessage.id);
      setDeletedMessageIds(prev => [...prev, selectedMessage.id]);
      setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
      toast.success('Message deleted for you');
    } catch (error) {
      toast.error('Failed to delete message');
    }
    setShowDeleteMessageConfirm(false);
    setShowMessageOptions(false);
    setSelectedMessage(null);
    setDeleteMode(null);
  };

  // Delete message for everyone
  const handleDeleteForEveryone = async () => {
    if (!selectedMessage || !chatId) return;
    
    try {
      await deleteMessageForEveryone(chatId, selectedMessage.id, user.id);
      await patchDmMessageDeletedInCaches(user.id, chatId, selectedMessage.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === selectedMessage.id
            ? { ...m, deleted: true, text: 'This message was deleted' }
            : m
        )
      );
      toast.success('Message deleted for everyone');
    } catch (error) {
      toast.error(error.message || 'Failed to delete message');
    }
    setShowDeleteMessageConfirm(false);
    setShowMessageOptions(false);
    setSelectedMessage(null);
    setDeleteMode(null);
  };

  // Handle swipe for reply
  const handleSwipeStart = (messageId, e) => {
    const touch = e.touches ? e.touches[0] : e;
    setSwipeStates(prev => ({
      ...prev,
      [messageId]: { startX: touch.clientX, currentX: touch.clientX }
    }));
  };

  const handleSwipeMove = (messageId, e) => {
    if (!swipeStates[messageId]) return;
    
    const touch = e.touches ? e.touches[0] : e;
    setSwipeStates(prev => ({
      ...prev,
      [messageId]: { ...prev[messageId], currentX: touch.clientX }
    }));
  };

  const handleSwipeEnd = (message, isOwn) => {
    const state = swipeStates[message.id];
    if (!state) return;

    const diff = state.currentX - state.startX;
    const threshold = 50;

    // Swipe right on received, swipe left on own
    if ((isOwn && diff < -threshold) || (!isOwn && diff > threshold)) {
      setReplyTo(message);
      inputRef.current?.focus();
    }

    setSwipeStates(prev => {
      const newStates = { ...prev };
      delete newStates[message.id];
      return newStates;
    });
  };

  // Scroll to original message when clicking reply preview
  const scrollToMessage = (messageId) => {
    const element = messageRefs.current[messageId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the message briefly
      element.classList.add('ring-2', 'ring-[#2563EB]', 'ring-opacity-50');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-[#2563EB]', 'ring-opacity-50');
      }, 2000);
    }
  };

  // Handle report user
  const handleReportUser = async () => {
    if (!chatId || !otherUserId) return;
    
    setReporting(true);
    try {
      await reportAndRestrictUser(user.id, otherUserId, chatId);
      await unfollowFriend(user.id, otherUserId);
      
      toast.success('User reported. Chat has been restricted.');
      setChatEnabled(false);
      setChatStatus('restricted');
      setRelationshipStatus(RELATIONSHIP_STATUS.UNFOLLOWED);
      navigate('/chat');
    } catch (error) {
      toast.error('Failed to report user');
    } finally {
      setReporting(false);
      setShowReportConfirm(false);
    }
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }
  };

  const messageById = useMemo(
    () => Object.fromEntries(messages.map((m) => [m.id, m])),
    [messages]
  );

  const visibleMessages = messages.filter((m) => !deletedMessageIds.includes(m.id));

  const groupedMessages = visibleMessages.reduce((groups, message) => {
    const date = formatMessageDate(message.timestamp);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  const initials = (otherUser?.username || 'U').slice(0, 2).toUpperCase();
  const displayName = otherUserProfile?.fullName || otherUser?.username || 'Unknown';

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
        <Header />
        {/* Skeleton Top Bar */}
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-b border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse rounded" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse" />
                <div>
                  <div className="w-24 h-4 bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse rounded mb-1.5" />
                  <div className="w-16 h-3 bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Skeleton Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ maxHeight: `calc(100vh - 140px)` }}>
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="space-y-3 py-2" aria-hidden>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                  <div className="h-11 w-[58%] max-w-sm rounded-2xl bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!otherUser) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <User className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-2">
            User not found
          </h2>
          <Button onClick={() => navigate('/chat')} variant="outline" className="rounded-[6px]">
            Back to Chats
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212] flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-b border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="p-2 -ml-2 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <button
              onClick={() => navigate(`/user/${otherUserId}`)}
              className="flex items-center gap-3"
            >
              <UserAvatar
                src={otherUser.photo_url}
                username={otherUser.username}
                className="w-10 h-10"
              />
              
              <div className="text-left">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] text-sm">
                    {displayName}
                  </span>
                  {otherUser.verified && <VerifiedBadge size="sm" />}
                </div>
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs">
                  @{otherUser.username}
                </p>
              </div>
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px]">
              <DropdownMenuItem
                onClick={() => navigate(`/user/${otherUserId}`)}
                className="dark:text-neutral-50 discuss:text-[#F5F5F5] dark:focus:bg-neutral-700 discuss:focus:bg-[#333333] rounded-[6px]"
              >
                <User className="w-4 h-4 mr-2" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-neutral-700 discuss:bg-[#333333]" />
              <DropdownMenuItem
                onClick={() => setShowAutoDeleteConfirm(true)}
                className="dark:text-neutral-50 discuss:text-[#F5F5F5] dark:focus:bg-neutral-700 discuss:focus:bg-[#333333] rounded-[6px]"
              >
                <Clock className="w-4 h-4 mr-2" />
                {autoDeleteEnabled ? 'Disable Auto-Delete' : 'Enable Auto-Delete (24h)'}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="dark:bg-neutral-700 discuss:bg-[#333333]" />
              <DropdownMenuItem
                onClick={() => setShowReportConfirm(true)}
                className="text-[#F59E0B] focus:text-[#F59E0B] dark:focus:bg-neutral-700 discuss:focus:bg-[#333333] rounded-[6px]"
              >
                <Flag className="w-4 h-4 mr-2" />
                Report User
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[#EF4444] focus:text-[#EF4444] dark:focus:bg-neutral-700 discuss:focus:bg-[#333333] rounded-[6px]"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Auto-delete banner */}
      {autoDeleteEnabled && (
        <div className="bg-[#F59E0B]/10 border-b border-[#F59E0B]/20 px-4 py-2">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#92400E] dark:text-[#FCD34D] discuss:text-[#FCD34D]">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">
                Auto-delete enabled • Messages delete after 24 hours
              </span>
            </div>
            <button
              onClick={() => setShowAutoDeleteConfirm(true)}
              className="text-[#92400E] dark:text-[#FCD34D] discuss:text-[#FCD34D] text-xs font-semibold hover:underline"
            >
              Turn off
            </button>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-b border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] px-4 py-2">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="w-1 h-10 bg-[#2563EB] discuss:bg-[#EF4444] rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-[#2563EB] discuss:text-[#EF4444] text-xs font-semibold">
                Replying to {replyTo.sender === user.id ? 'yourself' : otherUser?.username}
              </p>
              <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm truncate">
                {replyPreviewText(replyTo, messageById)}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] text-neutral-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide"
        style={{ maxHeight: `calc(100vh - ${autoDeleteEnabled ? 176 : (replyTo ? 180 : 140)}px)` }}
      >
        <div className="max-w-2xl mx-auto space-y-4">
          {!liveMessagesSynced && messages.length === 0 && (
            <div className="space-y-3 py-2" aria-hidden>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                >
                  <div className="h-11 w-[58%] max-w-sm rounded-2xl bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs px-3 py-1 rounded-full">
                  {date}
                </span>
              </div>
              
              {/* Messages for this date */}
              {dateMessages.map((message, index) => {
                const isOwn = message.sender === user.id;
                const showAvatar = !isOwn && (index === 0 || dateMessages[index - 1]?.sender !== message.sender);
                const swipeState = swipeStates[message.id];
                const swipeOffset = swipeState ? swipeState.currentX - swipeState.startX : 0;
                const clampedOffset = isOwn 
                  ? Math.min(0, Math.max(-60, swipeOffset))
                  : Math.max(0, Math.min(60, swipeOffset));
                
                return (
                  <div
                    key={message.id}
                    ref={el => messageRefs.current[message.id] = el}
                    className={`flex items-end gap-2 mb-2 ${isOwn ? 'justify-end' : 'justify-start'} relative transition-all duration-300`}
                    onTouchStart={(e) => {
                      handleSwipeStart(message.id, e);
                      handleTouchStart(message);
                    }}
                    onTouchMove={(e) => {
                      handleSwipeMove(message.id, e);
                      handleTouchMove();
                    }}
                    onTouchEnd={() => {
                      handleSwipeEnd(message, isOwn);
                      handleTouchEnd();
                    }}
                  >
                    {/* Swipe reply indicator */}
                    {!isOwn && swipeOffset > 30 && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2">
                        <Reply className="w-5 h-5 text-[#2563EB] discuss:text-[#EF4444]" />
                      </div>
                    )}
                    {isOwn && swipeOffset < -30 && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2">
                        <Reply className="w-5 h-5 text-[#2563EB] discuss:text-[#EF4444] transform scale-x-[-1]" />
                      </div>
                    )}

                    {!isOwn && showAvatar && (
                      <UserAvatar
                        src={otherUser.photo_url}
                        username={otherUser.username}
                        className="w-6 h-6 shrink-0"
                      />
                    )}
                    {!isOwn && !showAvatar && <div className="w-6" />}
                    
                    <div
                      style={{ transform: `translateX(${clampedOffset}px)` }}
                      className={`max-w-[75%] transition-transform duration-100 ${message.deleted ? 'opacity-60' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleMessageLongPress(message);
                      }}
                    >
                      {/* Reply reference - ONLY this is clickable to scroll */}
                      {message.replyTo && (
                        <button
                          onClick={() => scrollToMessage(message.replyTo.id)}
                          className={`w-full mb-1 px-3 py-1.5 rounded-lg text-xs text-left cursor-pointer hover:opacity-80 transition-opacity ${
                            isOwn 
                              ? 'bg-[#1D4ED8] discuss:bg-[#DC2626] text-white/80' 
                              : 'bg-neutral-100 dark:bg-neutral-700 discuss:bg-[#333333] text-neutral-500 dark:text-neutral-400'
                          }`}
                        >
                          <p className="font-medium truncate">
                            {message.replyTo.sender === user.id ? 'You' : otherUser?.username}
                          </p>
                          <p className="truncate opacity-80">
                            {replyPreviewText(message.replyTo, messageById)}
                          </p>
                        </button>
                      )}
                      
                      {/* Message bubble - NO click handler for navigation */}
                      <div
                        className={`px-4 py-2 rounded-2xl select-none ${
                          isOwn
                            ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white rounded-br-md'
                            : 'bg-white dark:bg-neutral-800 discuss:bg-[#262626] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {isDeletedForEveryone(message) ? (
                            <em className="opacity-70">{DELETED_MESSAGE_PREVIEW}</em>
                          ) : (
                            <ChatLinkText text={message.text} />
                          )}
                        </p>
                        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                          <p className={`text-[10px] ${isOwn ? 'text-white/70' : 'text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]'}`}>
                            {formatMessageTime(message.timestamp)}
                          </p>
                          {isOwn && message.status === 'sent' && (
                            <Check className="w-3 h-3 text-white/70" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          
          {liveMessagesSynced && visibleMessages.length === 0 && chatEnabled && (
            <div className="text-center py-10">
              <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">
                No messages yet. Say hello! 👋
              </p>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat disabled message */}
      {!chatEnabled && (
        <div className="bg-[#FEF3C7] dark:bg-[#F59E0B]/20 discuss:bg-[#F59E0B]/10 border-t border-[#F59E0B]/30 px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-[#F59E0B] shrink-0" />
              <div className="flex-1">
                <p className="text-[#92400E] dark:text-[#FCD34D] discuss:text-[#FCD34D] text-sm font-medium">
                  You can no longer send messages to this user
                </p>
                <p className="text-[#B45309] dark:text-[#FBBF24] discuss:text-[#FBBF24] text-xs mt-0.5">
                  {chatStatus === 'restricted' 
                    ? 'This chat has been restricted due to a report.'
                    : relationshipStatus === RELATIONSHIP_STATUS.UNFOLLOWED 
                      ? (unfollowedBy === user?.id 
                          ? 'You unfollowed this user. Send a friend request to chat again.'
                          : 'This user has unfollowed you.')
                      : 'You need to be friends to send messages.'}
                </p>
              </div>
              {chatStatus !== 'restricted' && (
                <FriendRequestButton
                  targetUserId={otherUserId}
                  targetUsername={otherUser?.username}
                  size="sm"
                  showChat={false}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message input */}
      {chatEnabled && (
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-t border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] px-4 py-3 sticky bottom-0">
          <div className="max-w-2xl mx-auto">
            {replyTo && (
              <div className="mb-2 bg-neutral-100 dark:bg-neutral-700 discuss:bg-[#262626] p-2 rounded-[8px] border-l-2 border-[#2563EB] discuss:border-[#EF4444]">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#2563EB] discuss:text-[#EF4444]">
                      Replying to {replyTo.sender === user?.id ? 'yourself' : `@${otherUser?.username || 'User'}`}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 discuss:text-[#9CA3AF] truncate">
                      {replyPreviewText(replyTo, {})}
                    </p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} className="ml-2 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-600 discuss:hover:bg-[#333333] rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={replyTo ? "Type your reply..." : "Type a message..."}
                className="flex-1 bg-neutral-100 dark:bg-neutral-900 discuss:bg-[#262626] border-0 text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 discuss:placeholder:text-[#9CA3AF] rounded-full px-4"
                disabled={sending}
              />
              <Button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="rounded-full w-10 h-10 p-0 bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white shadow-button"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Message options dialog - Long press options */}
      <AlertDialog open={showMessageOptions} onOpenChange={setShowMessageOptions}>
        <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px] max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-neutral-50 discuss:text-[#F5F5F5] text-center">
              Message Options
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2">
            <button
              onClick={() => {
                setReplyTo(selectedMessage);
                setShowMessageOptions(false);
                setSelectedMessage(null);
                inputRef.current?.focus();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] transition-colors"
            >
              <Reply className="w-5 h-5 text-[#2563EB] discuss:text-[#EF4444]" />
              <span>Reply</span>
            </button>
            {!selectedMessage?.deleted && (
              <button
                onClick={handleCopyMessage}
                className="w-full flex items-center gap-3 p-3 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] transition-colors"
              >
                <Copy className="w-5 h-5 text-[#10B981]" />
                <span>Copy</span>
              </button>
            )}
            <button
              onClick={() => {
                setDeleteMode('me');
                setShowDeleteMessageConfirm(true);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] transition-colors"
            >
              <Trash2 className="w-5 h-5 text-[#F59E0B]" />
              <span>Delete for Me</span>
            </button>
            {selectedMessage?.sender === user.id && !selectedMessage?.deleted && (
              <button
                onClick={() => {
                  setDeleteMode('everyone');
                  setShowDeleteMessageConfirm(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#333333] text-[#EF4444] transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete for Everyone</span>
              </button>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="w-full dark:bg-neutral-700 dark:text-neutral-50 dark:border-neutral-700 discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333] rounded-[6px]">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete message confirmation */}
      <AlertDialog open={showDeleteMessageConfirm} onOpenChange={setShowDeleteMessageConfirm}>
        <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-neutral-50 discuss:text-[#F5F5F5]">
              {deleteMode === 'everyone' ? 'Delete for Everyone?' : 'Delete for Me?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-neutral-400 discuss:text-[#9CA3AF]">
              {deleteMode === 'everyone' 
                ? 'This message will be deleted for everyone in this chat. The message will show as "This message was deleted".'
                : 'This message will be removed from your chat. The other person can still see it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-neutral-700 dark:text-neutral-50 dark:border-neutral-700 discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333] rounded-[6px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteMode === 'everyone' ? handleDeleteForEveryone : handleDeleteForMe}
              className="bg-[#EF4444] text-white hover:bg-[#DC2626] rounded-[6px]"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete chat confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-neutral-50 discuss:text-[#F5F5F5] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              Delete Chat?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-neutral-400 discuss:text-[#9CA3AF]">
              This will delete the chat for both users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-neutral-700 dark:text-neutral-50 dark:border-neutral-700 discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333] rounded-[6px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              disabled={deleting}
              className="bg-[#EF4444] text-white hover:bg-[#DC2626] rounded-[6px]"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Chat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-delete confirmation */}
      <AlertDialog open={showAutoDeleteConfirm} onOpenChange={setShowAutoDeleteConfirm}>
        <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-neutral-50 discuss:text-[#F5F5F5] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#F59E0B]" />
              {autoDeleteEnabled ? 'Disable Auto-Delete?' : 'Enable Auto-Delete?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-neutral-400 discuss:text-[#9CA3AF]">
              {autoDeleteEnabled 
                ? 'Messages will be kept permanently.'
                : 'All messages will be automatically deleted after 24 hours. This applies to this chat only and works for both users.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-neutral-700 dark:text-neutral-50 dark:border-neutral-700 discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333] rounded-[6px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleAutoDelete}
              className={autoDeleteEnabled 
                ? "bg-[#10B981] text-white hover:bg-[#059669] rounded-[6px]"
                : "bg-[#F59E0B] text-white hover:bg-[#D97706] rounded-[6px]"
              }
            >
              {autoDeleteEnabled ? 'Disable' : 'Enable Auto-Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report confirmation */}
      <AlertDialog open={showReportConfirm} onOpenChange={setShowReportConfirm}>
        <AlertDialogContent className="dark:bg-neutral-800 dark:border-neutral-700 discuss:bg-[#262626] discuss:border-[#333333] rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-neutral-50 discuss:text-[#F5F5F5] flex items-center gap-2">
              <Flag className="w-5 h-5 text-[#F59E0B]" />
              Report User?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-neutral-400 discuss:text-[#9CA3AF]">
              You will no longer be able to message this user. Both users will be restricted from chatting. This user will also be automatically unfollowed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-neutral-700 dark:text-neutral-50 dark:border-neutral-700 discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333] rounded-[6px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReportUser}
              disabled={reporting}
              className="bg-[#EF4444] text-white hover:bg-[#DC2626] rounded-[6px]"
            >
              {reporting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Report & Restrict'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
