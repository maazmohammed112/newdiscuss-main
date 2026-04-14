import { useState, useEffect } from 'react';
import { getUser } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfileDb';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import VerifiedBadge from '@/components/VerifiedBadge';
import FriendRequestButton from '@/components/FriendRequestButton';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { Calendar, Loader2, X, ExternalLink, ChevronDown, ChevronUp, User } from 'lucide-react';

export default function CommentUserInfoModal({ open, onClose, userId, currentUserId }) {
  const [userData, setUserData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);

  const BIO_TRUNCATE_LENGTH = 100;

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      setLoadingProfile(true);
      setBioExpanded(false);
      setShowImagePreview(false);
      
      // Fetch from primary Firebase
      getUser(userId)
        .then((user) => setUserData(user))
        .catch(() => setUserData(null))
        .finally(() => setLoading(false));
      
      // Fetch from secondary Firebase
      getUserProfile(userId)
        .then((profile) => setProfileData(profile))
        .catch(() => setProfileData(null))
        .finally(() => setLoadingProfile(false));
    }
  }, [open, userId]);

  const joinDate = userData?.created_at
    ? new Date(userData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const initials = (userData?.username || 'U').slice(0, 2).toUpperCase();

  const bioNeedsTruncation = profileData?.bio && profileData.bio.length > BIO_TRUNCATE_LENGTH;
  const displayBio = bioNeedsTruncation && !bioExpanded 
    ? profileData.bio.slice(0, BIO_TRUNCATE_LENGTH) + '...'
    : profileData?.bio;

  return (
    <>
      <Dialog open={open && !showImagePreview} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent 
          hideClose={true}
          className="sm:max-w-xs bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] dark:border-[#334155] discuss:border-[#333333] p-0 overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#6275AF]" />
            </div>
          ) : !userData ? (
            <div className="text-center py-12 px-6">
              <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[13px]">User not found</p>
            </div>
          ) : (
            <>
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[#F5F5F7] dark:hover:bg-[#334155] discuss:hover:bg-[#262626] text-[#6275AF] hover:text-[#0F172A] dark:hover:text-white discuss:hover:text-[#F5F5F5] transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* User Info */}
              <div className="bg-gradient-to-b from-[#2563EB]/10 dark:from-[#2563EB]/20 discuss:from-[#EF4444]/10 to-transparent pt-8 pb-4 px-6 text-center">
                {/* Profile Picture - Clickable if exists */}
                {userData.photo_url ? (
                  <button 
                    onClick={() => setShowImagePreview(true)}
                    className="relative group mx-auto mb-3 block"
                  >
                    <img referrerPolicy="no-referrer" crossOrigin="anonymous" src={userData.photo_url} alt={userData.username} className="w-16 h-16 rounded-full mx-auto shadow-lg discuss:shadow-none discuss:border discuss:border-[#333333] object-cover group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <div className="bg-black/50 rounded-full p-1.5">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#2563EB]/20 discuss:shadow-none discuss:border discuss:border-[#333333]">
                    <span className="text-white text-lg font-bold">{initials}</span>
                  </div>
                )}
                
                {/* Full Name */}
                {profileData?.fullName && (
                  <h3 className="font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[16px] flex items-center justify-center gap-1">
                    {profileData.fullName}
                    {userData.verified && <VerifiedBadge size="xs" />}
                  </h3>
                )}
                
                {/* Username */}
                <p data-testid="comment-user-info-name" className={`flex items-center justify-center gap-1 ${profileData?.fullName ? 'text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[13px]' : 'font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[16px]'}`}>
                  @{userData.username}
                  {!profileData?.fullName && userData.verified && <VerifiedBadge size="xs" />}
                </p>
              </div>

              {/* Profile Info */}
              <div className="px-6 pb-6 space-y-3">
                {/* Bio */}
                {loadingProfile ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6275AF]" />
                    <span className="text-[#6275AF] text-xs">Loading...</span>
                  </div>
                ) : profileData?.bio && (
                  <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] discuss:border discuss:border-[#333333] rounded-xl p-3">
                    <p className="text-[#0F172A] dark:text-[#E2E8F0] discuss:text-[#E5E7EB] text-[12px] leading-relaxed whitespace-pre-wrap">
                      {displayBio}
                    </p>
                    {bioNeedsTruncation && (
                      <button
                        onClick={() => setBioExpanded(!bioExpanded)}
                        className="text-[#2563EB] discuss:text-[#60A5FA] hover:underline text-[11px] mt-1 flex items-center gap-1"
                      >
                        {bioExpanded ? (
                          <>Less <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>More <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Social Links */}
                {!loadingProfile && profileData?.socialLinks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {profileData.socialLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] hover:bg-[#E8EBF0] dark:hover:bg-[#1E293B] discuss:hover:bg-[#333333] text-[#2563EB] discuss:text-[#60A5FA] text-[11px] font-medium px-2.5 py-1 rounded-full border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] transition-colors"
                      >
                        {link.name}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Join Date */}
                <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] discuss:border discuss:border-[#333333] rounded-xl p-3 text-center">
                  <Calendar className="w-4 h-4 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] mx-auto mb-1" />
                  <p className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[12px] font-semibold">{joinDate}</p>
                  <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[10px]">Joined</p>
                </div>

                {/* Friend Actions - Only show for other users */}
                {currentUserId && currentUserId !== userId && (
                  <div className="flex justify-center">
                    <FriendRequestButton
                      targetUserId={userId}
                      targetUsername={userData?.username}
                      size="sm"
                      showChat={true}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        open={showImagePreview}
        onClose={() => setShowImagePreview(false)}
        imageUrl={userData?.photo_url}
        altText={userData?.username}
      />
    </>
  );
}
