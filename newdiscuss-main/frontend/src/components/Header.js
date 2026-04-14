import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUnreadCount } from '@/lib/chatsDb';
import { subscribeToReceivedRequests } from '@/lib/relationshipsDb';
import { subscribeToAdminMessage, markAdminMessageSeen } from '@/lib/adminMessageDb';
import { subscribeToCommentBadges } from '@/lib/commentsDb';
import DiscussLogo from '@/components/DiscussLogo';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { User, MessageCircle, Bell, Megaphone } from 'lucide-react';
import { useHighlights } from '@/contexts/HighlightsContext';

export default function Header() {
  const { user } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const { 
    unreadChatCount,
    unreadGroupMessages,
    pendingFriendRequests,
    pendingGroupRequests,
    hasNewGroupRequests,
  } = useHighlights();

  const [adminMessage, setAdminMessage] = useState(null);
  const [hasUnseenAdmin, setHasUnseenAdmin] = useState(false);
  const [showAdminPopover, setShowAdminPopover] = useState(false);
  const [commentBadgeCount, setCommentBadgeCount] = useState(0);

  // Subscribe to comment badges
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribeCommentBadges = subscribeToCommentBadges(user.id, (badges) => {
      const count = Object.keys(badges || {}).length;
      setCommentBadgeCount(count);
    });
    return () => unsubscribeCommentBadges();
  }, [user?.id]);

  // Subscribe to admin message
  useEffect(() => {
    if (!user?.id) return;
    
    const unsubscribe = subscribeToAdminMessage((msg, isNew) => {
      setAdminMessage(msg);
      setHasUnseenAdmin(isNew);
    });
    
    return () => unsubscribe();
  }, [user?.id]);

  // Handle admin message popover open
  const handleAdminPopoverOpen = (open) => {
    setShowAdminPopover(open);
    if (open && hasUnseenAdmin) {
      markAdminMessageSeen();
      setHasUnseenAdmin(false);
    }
  };

  const totalNotifications = unreadChatCount + pendingFriendRequests + pendingGroupRequests + commentBadgeCount;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-neutral-900/95 discuss:bg-[#121212]/95 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 discuss:border-[#333333]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center" data-testid="header-logo">
          <DiscussLogo size="md" />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link to="/feed">
                <Button 
                  variant="ghost" 
                  data-testid="header-feed-btn" 
                  className="text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5] hover:bg-neutral-100 dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] rounded-[6px] px-3 sm:px-4 text-[13px] font-medium"
                >
                  Feed
                </Button>
              </Link>
              
              {/* Admin Message Icon - Only show if active */}
              {adminMessage && (
                <Popover open={showAdminPopover} onOpenChange={handleAdminPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="relative w-9 h-9 p-0 rounded-[6px] bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
                    >
                      <Megaphone className="w-4 h-4 text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF]" />
                      {hasUnseenAdmin && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#EF4444] rounded-full animate-pulse" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="end">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#2563EB] discuss:text-[#EF4444]">
                        <Megaphone className="w-4 h-4" />
                        Admin Message
                      </div>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">
                        {adminMessage.message}
                      </p>
                      <p className="text-[10px] text-neutral-500">
                        {adminMessage.createdAt && new Date(adminMessage.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              
              <Link to="/chat" className="relative">
                <Button 
                  variant="ghost" 
                  data-testid="header-chat-btn" 
                  className="w-9 h-9 p-0 rounded-[6px] bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
                >
                  <MessageCircle className="w-4 h-4 text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF]" />
                </Button>
                {(unreadChatCount > 0 || unreadGroupMessages || hasNewGroupRequests) && (
                  <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[10px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-1">
                    {unreadChatCount > 0 ? (unreadChatCount > 99 ? '99+' : unreadChatCount) : ''}
                  </span>
                )}
              </Link>
              <Link to="/profile" className="relative">
                <Button 
                  variant="ghost" 
                  data-testid="header-profile-btn" 
                  className="w-9 h-9 p-0 rounded-[6px] bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] overflow-hidden"
                >
                  {user.photo_url ? (
                    <UserAvatar
                      src={user.photo_url}
                      username={user.username}
                      className="w-full h-full rounded-none"
                      alt={user.username}
                    />
                  ) : (
                    <User className="w-4 h-4 text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF]" />
                  )}
                </Button>
                {(pendingFriendRequests > 0 || commentBadgeCount > 0) && (
                  <span className="absolute -top-1 -right-1 bg-[#F59E0B] text-white text-[10px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-1">
                    {(pendingFriendRequests + commentBadgeCount) > 99 ? '99+' : pendingFriendRequests + commentBadgeCount}
                  </span>
                )}
              </Link>
            </>
          ) : isLanding ? (
            <>
              <Link to="/login">
                <Button 
                  variant="ghost" 
                  data-testid="header-login-btn" 
                  className="text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5] hover:bg-neutral-100 dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] rounded-[6px] px-4 text-[13px] font-medium border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
                  style={
                    document.documentElement.classList.contains('discuss-black')
                      ? { color: '#F0F0F8', borderColor: 'rgba(255,0,127,0.25)', backgroundColor: 'transparent' }
                      : {}
                  }
                >
                  Login
                </Button>
              </Link>
              <Link to="/register">
                <Button 
                  data-testid="header-register-btn" 
                  className="bg-[#2563EB] discuss:bg-[#EF4444] text-white hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] rounded-[6px] px-5 text-[13px] font-medium shadow-button hover:shadow-button-hover transition-all"
                >
                  Register
                </Button>
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
