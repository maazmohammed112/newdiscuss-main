import UserAvatar from '@/components/UserAvatar';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUser, getPostsByUser } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfileDb';
import Header from '@/components/Header';
import PostCard from '@/components/PostCard';
import VerifiedBadge from '@/components/VerifiedBadge';
import FriendRequestButton from '@/components/FriendRequestButton';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { ArrowLeft, User, FileText, Calendar, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';


export default function UserPostsPage() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userData, setUserData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // Max characters before truncation
  const BIO_TRUNCATE_LENGTH = 150;

  useEffect(() => {
    if (userId) {
      setLoading(true);
      setLoadingProfile(true);
      
      // Fetch from primary Firebase (user data + posts)
      Promise.all([getUser(userId), getPostsByUser(userId)])
        .then(([u, p]) => { setUserData(u); setPosts(p); })
        .catch(() => {})
        .finally(() => setLoading(false));
      
      // Fetch from secondary Firebase (profile data)
      getUserProfile(userId)
        .then(data => setProfileData(data))
        .catch(() => {})
        .finally(() => setLoadingProfile(false));
    }
  }, [userId]);

  const handlePostDeleted = (postId) => setPosts(prev => prev.filter(p => p.id !== postId));
  const handlePostUpdated = (updatedPost) => setPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p));
  const handleVoteChanged = (postId, voteData) => setPosts(prev =>
    prev.map(p => p.id === postId ? { ...p, upvote_count: voteData.upvote_count, downvote_count: voteData.downvote_count, votes: voteData.votes } : p)
  );

  const joinDate = userData?.created_at
    ? new Date(userData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const initials = (userData?.username || 'U').slice(0, 2).toUpperCase();

  // Check if bio needs truncation
  const bioNeedsTruncation = profileData?.bio && profileData.bio.length > BIO_TRUNCATE_LENGTH;
  const displayBio = bioNeedsTruncation && !bioExpanded 
    ? profileData.bio.slice(0, BIO_TRUNCATE_LENGTH) + '...'
    : profileData?.bio;

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#121212]">
      <Header />
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        <button
          data-testid="user-posts-back"
          onClick={() => navigate(location.state?.from || '/feed')}
          className="flex items-center gap-2 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-white discuss:hover:text-[#F5F5F5] text-[13px] font-medium mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#6275AF]" /></div>
        ) : !userData ? (
          <div className="text-center py-16">
            <h2 className="text-lg font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">User not found</h2>
          </div>
        ) : (
          <>
            {/* User header card */}
            <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] rounded-2xl p-5 mb-6">
              <div className="flex items-start gap-4">
                {/* Profile Picture - Clickable if exists */}
                {userData.photo_url ? (
                  <button 
                    onClick={() => setShowImagePreview(true)}
                    className="relative group shrink-0"
                  >
                    <UserAvatar
                      src={userData.photo_url}
                      username={userData.username}
                      className="w-14 h-14 shadow-md discuss:shadow-none discuss:border discuss:border-[#333333] group-hover:opacity-90 transition-opacity"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <div className="bg-black/50 rounded-full p-1.5">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="shrink-0">
                    <UserAvatar src={null} username={userData?.username} className="w-14 h-14" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {/* Full Name (if available) */}
                  {profileData?.fullName && (
                    <h1 className="font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[18px] flex items-center gap-1">
                      {profileData.fullName}
                      {userData.verified && <VerifiedBadge size="sm" />}
                    </h1>
                  )}
                  
                  {/* Username */}
                  <div data-testid="user-posts-username" className={`flex items-center gap-1 ${profileData?.fullName ? 'text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[14px]' : 'font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[18px]'}`}>
                    @{userData.username}
                    {!profileData?.fullName && userData.verified && <VerifiedBadge size="sm" />}
                  </div>
                  
                  <div className="flex items-center gap-4 mt-1">
                    <span className="flex items-center gap-1 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[12px]">
                      <Calendar className="w-3.5 h-3.5" /> Joined {joinDate}
                    </span>
                    <span className="flex items-center gap-1 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[12px]">
                      <FileText className="w-3.5 h-3.5" /> {posts.length} posts
                    </span>
                  </div>

                  {/* Friend Request Button - Show if not viewing own profile */}
                  {currentUser && currentUser.id !== userId && (
                    <div className="mt-3">
                      <FriendRequestButton
                        targetUserId={userId}
                        targetUsername={userData.username}
                        size="sm"
                        showChat={true}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Bio Section */}
              {loadingProfile ? (
                <div className="mt-4 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6275AF]" />
                  <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs">Loading profile...</span>
                </div>
              ) : profileData?.bio && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <p className="text-[#0F172A] dark:text-[#E2E8F0] discuss:text-[#E5E7EB] text-[13px] leading-relaxed whitespace-pre-wrap">
                    {displayBio}
                  </p>
                  {bioNeedsTruncation && (
                    <button
                      onClick={() => setBioExpanded(!bioExpanded)}
                      className="text-[#2563EB] discuss:text-[#60A5FA] hover:underline text-[12px] mt-1 flex items-center gap-1"
                    >
                      {bioExpanded ? (
                        <>Show less <ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <>Show more <ChevronDown className="w-3 h-3" /></>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Social Links Section */}
              {!loadingProfile && profileData?.socialLinks?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <div className="flex flex-wrap gap-2">
                    {profileData.socialLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] hover:bg-[#E8EBF0] dark:hover:bg-[#1E293B] discuss:hover:bg-[#333333] text-[#2563EB] discuss:text-[#60A5FA] text-[12px] font-medium px-3 py-1.5 rounded-full border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] transition-colors"
                      >
                        {link.name}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Posts */}
            {posts.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-2xl border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                <User className="w-8 h-8 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] mx-auto mb-2" />
                <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[13px]">This user hasn't posted anything yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUser={currentUser}
                    onDeleted={handlePostDeleted}
                    onUpdated={handlePostUpdated}
                    onVoteChanged={handleVoteChanged}
                    onTagClick={() => {}}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        open={showImagePreview}
        onClose={() => setShowImagePreview(false)}
        imageUrl={userData?.photo_url}
        altText={userData?.username}
      />
    </div>
  );
}
