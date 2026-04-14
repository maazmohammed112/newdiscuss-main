import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FriendRequestButton from './FriendRequestButton';
import VerifiedBadge from './VerifiedBadge';
import { User } from 'lucide-react';

export default function UserSearchResult({ 
  user, 
  currentUserId,
  onClose,
  showActions = true 
}) {
  const navigate = useNavigate();
  const initials = (user.username || 'U').slice(0, 2).toUpperCase();

  const handleViewProfile = () => {
    onClose?.();
    navigate(`/user/${user.id}`);
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] rounded-xl hover:shadow-md dark:hover:shadow-none transition-all">
      <button
        onClick={handleViewProfile}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        {user.photo_url ? (
          <img referrerPolicy="no-referrer" crossOrigin="anonymous" src={user.photo_url}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{initials}</span>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm truncate">
              @{user.username}
            </span>
            {user.verified && <VerifiedBadge size="sm" />}
          </div>
          {user.email && (
            <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-xs truncate">
              {user.email}
            </p>
          )}
        </div>
      </button>

      {showActions && currentUserId !== user.id && (
        <div className="shrink-0 ml-2">
          <FriendRequestButton
            targetUserId={user.id}
            targetUsername={user.username}
            size="sm"
            showChat={false}
          />
        </div>
      )}
    </div>
  );
}
