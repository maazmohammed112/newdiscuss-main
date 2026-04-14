import UserAvatar from '@/components/UserAvatar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getPosts, getUser } from '@/lib/db';
import { 
  getUserProfile, 
  updateFullName, 
  deleteFullName, 
  updateBio, 
  deleteBio,
  addSocialLink,
  editSocialLink,
  deleteSocialLink,
  BIO_CHAR_LIMIT,
  MAX_SOCIAL_LINKS
} from '@/lib/userProfileDb';
import {
  getReceivedRequests,
  getSentRequests,
  getFriendsWithDetails,
  searchUsers,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  subscribeToReceivedRequests,
  getSuggestedFriends
} from '@/lib/relationshipsDb';
import { 
  subscribeToGroupInvites,
  acceptGroupInvite,
  rejectGroupInvite
} from '@/lib/groupsDb';
import Header from '@/components/Header';
import PostCard from '@/components/PostCard';
import ThemeSelector from '@/components/ThemeSelector';
import VerifiedBadge from '@/components/VerifiedBadge';
import VerificationRequestModal from '@/components/VerificationRequestModal';
import UserAdminMessage from '@/components/UserAdminMessage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import UserSearchResult from '@/components/UserSearchResult';
import ProfileShareModal from '@/components/ProfileShareModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  FileText, LogOut, Loader2, ChevronDown, ChevronUp, 
  Calendar, Filter, ShieldCheck, User, Pencil, Trash2, Plus, Link2, X, Check, ExternalLink,
  Info, Mail, Image as ImageIcon, Users, UserPlus, Search, Clock, MessageCircle, Share2, Bell, ArrowLeft, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import NotificationToggle from '@/components/NotificationToggle';
import { notifyFriendRequest, isNotificationsEnabled } from '@/lib/pushNotificationService';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userPosts, setUserPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showPosts, setShowPosts] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Profile data from secondary Firebase
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Edit states
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameInput, setFullNameInput] = useState('');
  const [savingFullName, setSavingFullName] = useState(false);
  const [deleteFullNameConfirm, setDeleteFullNameConfirm] = useState(false);

  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [deleteBioConfirm, setDeleteBioConfirm] = useState(false);

  const [addingLink, setAddingLink] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [editingLinkIndex, setEditingLinkIndex] = useState(null);
  const [editLinkName, setEditLinkName] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');
  const [deleteLinkConfirm, setDeleteLinkConfirm] = useState(null);

  // Check if max links reached
  const maxLinksReached = (profileData?.socialLinks?.length || 0) >= MAX_SOCIAL_LINKS;

  // Friend system states
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(null);
  const [requestUserDetails, setRequestUserDetails] = useState({});
  
  // Suggested friends
  const [suggestedFriends, setSuggestedFriends] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  // Fetch user posts
  useEffect(() => {
    if (user?.id) {
      setLoadingPosts(true);
      getPosts()
        .then(posts => setUserPosts(posts.filter(p => p.author_id === user.id)))
        .catch(() => {})
        .finally(() => setLoadingPosts(false));
    }
  }, [user]);

  // Fetch profile data from secondary Firebase
  useEffect(() => {
    if (user?.id) {
      setLoadingProfile(true);
      getUserProfile(user.id)
        .then(data => {
          setProfileData(data);
          setLoadingProfile(false);
        })
        .catch(() => setLoadingProfile(false));
    }
  }, [user?.id]);

  // Fetch friends and requests
  useEffect(() => {
    if (!user?.id) return;

    const loadFriendsData = async () => {
      setLoadingFriends(true);
      try {
        const [friendsData, received, sent] = await Promise.all([
          getFriendsWithDetails(user.id),
          getReceivedRequests(user.id),
          getSentRequests(user.id)
        ]);
        setFriends(friendsData);
        setReceivedRequests(received);
        setSentRequests(sent);

        // Load user details for requests
        const userIds = [...received.map(r => r.fromUserId), ...sent.map(r => r.toUserId)];
        const uniqueUserIds = [...new Set(userIds)];
        const details = {};
        await Promise.all(
          uniqueUserIds.map(async (uid) => {
            try {
              const userData = await getUser(uid);
              if (userData) {
                details[uid] = userData;
              }
            } catch {}
          })
        );
        setRequestUserDetails(details);
      } catch (error) {
        console.error('Error loading friends data:', error);
      } finally {
        setLoadingFriends(false);
      }
    };

    loadFriendsData();

    // Subscribe to received requests for real-time updates
    const unsubscribe = subscribeToReceivedRequests(user.id, async (requests) => {
      setReceivedRequests(prevReceived => {
        // Check for NEW requests (not seen before) to trigger notification
        const prevRequestIds = prevReceived.map(r => r.fromUserId);
        const newRequests = requests.filter(r => !prevRequestIds.includes(r.fromUserId));
        
        // Notify for new friend requests (only if notifications enabled)
        if (newRequests.length > 0 && isNotificationsEnabled()) {
          setRequestUserDetails(currentDetails => {
            for (const req of newRequests) {
              const userData = currentDetails[req.fromUserId];
              const username = userData?.username || 'Someone';
              notifyFriendRequest(req.fromUserId, username);
            }
            return currentDetails;
          });
        }
        return requests;
      });
      
      // Load details for new requests
      setRequestUserDetails(prevDetails => {
        const newUserIds = requests.map(r => r.fromUserId).filter(id => !prevDetails[id]);
        if (newUserIds.length > 0) {
          const fetchNewUsers = async () => {
            const fetchedDetails = {};
            await Promise.all(
              newUserIds.map(async (uid) => {
                try {
                  const userData = await getUser(uid);
                  if (userData) fetchedDetails[uid] = userData;
                } catch {}
              })
            );
            setRequestUserDetails(current => ({ ...current, ...fetchedDetails }));
          };
          fetchNewUsers();
        }
        return prevDetails;
      });
    });

    const unsubInvites = subscribeToGroupInvites(user.id, async (invites) => {
      setGroupInvites(invites);
      setRequestUserDetails(prevDetails => {
        const newUserIds = invites.map(r => r.invitedBy).filter(id => id && !prevDetails[id]);
        if (newUserIds.length > 0) {
          const fetchNewUsers = async () => {
            const fetchedDetails = {};
            await Promise.all(
              newUserIds.map(async (uid) => {
                try {
                  const userData = await getUser(uid);
                  if (userData) fetchedDetails[uid] = userData;
                } catch {}
              })
            );
            setRequestUserDetails(current => ({ ...current, ...fetchedDetails }));
          };
          fetchNewUsers();
        }
        return prevDetails;
      });
    });

    return () => {
      unsubscribe();
      unsubInvites();
    };
  }, [user?.id]);

  // Fetch suggested friends
  useEffect(() => {
    if (!user?.id) return;
    
    const loadSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const suggestions = await getSuggestedFriends(user.id, 6);
        setSuggestedFriends(suggestions);
      } catch (error) {
        console.error('Error loading suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };
    
    loadSuggestions();
  }, [user?.id, friends.length]); // Refresh when friends list changes

  // Search for friends
  useEffect(() => {
    if (!friendSearchQuery.trim() || !user?.id) {
      setFriendSearchResults([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setSearchingFriends(true);
      try {
        const results = await searchUsers(friendSearchQuery, user.id);
        setFriendSearchResults(results);
      } catch (error) {
        console.error('Friend search error:', error);
      } finally {
        setSearchingFriends(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [friendSearchQuery, user?.id]);

  const availableYears = useMemo(() => {
    const years = new Set();
    userPosts.forEach(p => {
      if (p.timestamp) years.add(new Date(p.timestamp).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [userPosts]);

  const filteredPosts = useMemo(() => {
    if (filterType === 'all') return userPosts;
    const now = new Date();
    return userPosts.filter(p => {
      if (!p.timestamp) return false;
      const d = new Date(p.timestamp);
      if (filterType === 'this_month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (filterType === 'month' && filterMonth !== '') {
        const yr = filterYear || now.getFullYear();
        return d.getMonth() === parseInt(filterMonth) && d.getFullYear() === parseInt(yr);
      }
      if (filterType === 'year' && filterYear) {
        return d.getFullYear() === parseInt(filterYear);
      }
      return true;
    });
  }, [userPosts, filterType, filterMonth, filterYear]);

  const handleLogout = async () => { 
    setLoggingOut(true); 
    await logout(); 
    window.history.replaceState(null, '', '/');
    navigate('/', { replace: true }); 
  };

  const handlePostDeleted = (postId) => setUserPosts(prev => prev.filter(p => p.id !== postId));
  const handlePostUpdated = (updatedPost) => setUserPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p));
  const handleVoteChanged = (postId, voteData) => setUserPosts(prev =>
    prev.map(p => p.id === postId ? { ...p, upvote_count: voteData.upvote_count, downvote_count: voteData.downvote_count, votes: voteData.votes } : p)
  );

  // Friend request handlers
  const handleAcceptRequest = async (fromUserId) => {
    setProcessingRequest(fromUserId);
    try {
      await acceptFriendRequest(user.id, fromUserId);
      setReceivedRequests(prev => prev.filter(r => r.fromUserId !== fromUserId));
      // Refresh friends list
      const friendsData = await getFriendsWithDetails(user.id);
      setFriends(friendsData);
      toast.success('Friend request accepted!');
    } catch (error) {
      toast.error('Failed to accept request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleDeclineRequest = async (fromUserId) => {
    setProcessingRequest(fromUserId);
    try {
      await declineFriendRequest(user.id, fromUserId);
      setReceivedRequests(prev => prev.filter(r => r.fromUserId !== fromUserId));
      toast.success('Friend request declined');
    } catch (error) {
      toast.error('Failed to decline request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleCancelRequest = async (toUserId) => {
    setProcessingRequest(toUserId);
    try {
      await cancelFriendRequest(user.id, toUserId);
      setSentRequests(prev => prev.filter(r => r.toUserId !== toUserId));
      toast.success('Friend request cancelled');
    } catch (error) {
      toast.error('Failed to cancel request');
    } finally {
      setProcessingRequest(null);
    }
  };

  // Full Name handlers
  const handleSaveFullName = async () => {
    if (!fullNameInput.trim()) return;
    setSavingFullName(true);
    try {
      await updateFullName(user.id, fullNameInput);
      setProfileData(prev => ({ ...prev, fullName: fullNameInput.trim() }));
      setEditingFullName(false);
      toast.success('Full name updated');
    } catch (err) {
      toast.error('Failed to update full name');
    } finally {
      setSavingFullName(false);
    }
  };

  const handleDeleteFullName = async () => {
    setSavingFullName(true);
    try {
      await deleteFullName(user.id);
      setProfileData(prev => ({ ...prev, fullName: undefined }));
      setDeleteFullNameConfirm(false);
      toast.success('Full name removed');
    } catch (err) {
      toast.error('Failed to remove full name');
    } finally {
      setSavingFullName(false);
    }
  };

  // Bio handlers
  const handleSaveBio = async () => {
    if (!bioInput.trim()) return;
    setSavingBio(true);
    try {
      await updateBio(user.id, bioInput);
      setProfileData(prev => ({ ...prev, bio: bioInput.trim().slice(0, BIO_CHAR_LIMIT) }));
      setEditingBio(false);
      toast.success('Bio updated');
    } catch (err) {
      toast.error('Failed to update bio');
    } finally {
      setSavingBio(false);
    }
  };

  const handleDeleteBio = async () => {
    setSavingBio(true);
    try {
      await deleteBio(user.id);
      setProfileData(prev => ({ ...prev, bio: undefined }));
      setDeleteBioConfirm(false);
      toast.success('Bio removed');
    } catch (err) {
      toast.error('Failed to remove bio');
    } finally {
      setSavingBio(false);
    }
  };

  // Social Link handlers
  const handleAddLink = async () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) return;
    if (maxLinksReached) {
      toast.error(`Maximum ${MAX_SOCIAL_LINKS} links allowed`);
      return;
    }
    setSavingLink(true);
    try {
      await addSocialLink(user.id, { name: newLinkName, url: newLinkUrl });
      const currentLinks = profileData?.socialLinks || [];
      setProfileData(prev => ({ 
        ...prev, 
        socialLinks: [...currentLinks, { name: newLinkName.trim(), url: newLinkUrl.trim() }] 
      }));
      setAddingLink(false);
      setNewLinkName('');
      setNewLinkUrl('');
      toast.success('Link added');
    } catch (err) {
      toast.error('Failed to add link');
    } finally {
      setSavingLink(false);
    }
  };

  const handleEditLink = async (index) => {
    if (!editLinkName.trim() || !editLinkUrl.trim()) return;
    setSavingLink(true);
    try {
      await editSocialLink(user.id, index, { name: editLinkName, url: editLinkUrl });
      const updatedLinks = [...(profileData?.socialLinks || [])];
      updatedLinks[index] = { name: editLinkName.trim(), url: editLinkUrl.trim() };
      setProfileData(prev => ({ ...prev, socialLinks: updatedLinks }));
      setEditingLinkIndex(null);
      toast.success('Link updated');
    } catch (err) {
      toast.error('Failed to update link');
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async (index) => {
    setSavingLink(true);
    try {
      await deleteSocialLink(user.id, index);
      const updatedLinks = (profileData?.socialLinks || []).filter((_, i) => i !== index);
      setProfileData(prev => ({ ...prev, socialLinks: updatedLinks }));
      setDeleteLinkConfirm(null);
      toast.success('Link removed');
    } catch (err) {
      toast.error('Failed to remove link');
    } finally {
      setSavingLink(false);
    }
  };

  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#121212]">
      <Header />
      <div className="max-w-xl mx-auto px-4 py-6 md:py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] hover:text-[#0F172A] dark:hover:text-white discuss:hover:text-[#F5F5F5] text-[13px] font-medium mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-none discuss:shadow-none border discuss:border discuss:border-[#333333] p-8 text-center relative rounded-2xl">
          
          {/* Top Right Icons - Share & Info */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {/* Share Button */}
            <button 
              onClick={() => setShowShareModal(true)}
              className="p-2 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-[#0F172A] discuss:hover:bg-[#262626] text-[#6275AF] hover:text-[#2563EB] discuss:hover:text-[#EF4444] transition-colors"
              title="Share Profile"
            >
              <Share2 className="w-5 h-5" />
            </button>
            
            {/* Info Icon */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-full hover:bg-[#F5F5F7] dark:hover:bg-[#0F172A] discuss:hover:bg-[#262626] text-[#6275AF] hover:text-[#2563EB] discuss:hover:text-[#EF4444] transition-colors">
                  <Info className="w-5 h-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4 bg-white dark:bg-[#1E293B] discuss:bg-[#262626] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]" align="end">
                <div className="space-y-3">
                  <h4 className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm">Profile Settings</h4>
                  
                  <div className="flex items-start gap-2 text-[12px] text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
                    <ImageIcon className="w-4 h-4 mt-0.5 shrink-0 text-[#2563EB] discuss:text-[#EF4444]" />
                    <p>Profile image can only be added or changed through your Gmail account. When you sign in with Google, your Gmail profile picture will automatically sync here.</p>
                  </div>
                  
                  <div className="flex items-start gap-2 text-[12px] text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
                    <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#2563EB] discuss:text-[#EF4444]" />
                    <p>Password change is currently disabled for security reasons.</p>
                  </div>
                  
                  <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                    <a
                      href="mailto:support@discussit.in"
                      className="flex items-center justify-center gap-2 w-full bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white text-[12px] font-medium py-2 px-3 rounded-lg transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Contact Support
                    </a>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Profile Picture - Clickable if exists */}
          {user?.photo_url ? (
            <button 
              onClick={() => setShowImagePreview(true)}
              className="relative group mx-auto mb-5 block"
            >
              <UserAvatar
                src={user.photo_url}
                username={user.username}
                className="w-24 h-24 mx-auto shadow-lg discuss:shadow-none object-cover discuss:border discuss:border-[#333333] rounded-full group-hover:opacity-90 transition-opacity"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black/50 rounded-full p-2">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
              </div>
            </button>
          ) : (
            <div className="w-24 h-24 mx-auto mb-5">
              <UserAvatar src={null} username={user?.username} className="w-24 h-24" />
            </div>
          )}

          <h1 data-testid="profile-username" className="font-heading text-xl font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] flex items-center justify-center gap-2">
            {user?.username}
            {user?.verified && <VerifiedBadge size="md" />}
          </h1>
          <p data-testid="profile-email" className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-[13px] mt-0.5">{user?.email}</p>

          <div className="inline-flex items-center gap-2 bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#1a1a1a] discuss:border discuss:border-[#333333] px-4 py-2 mt-4 rounded-lg">
            <FileText className="w-4 h-4 text-[#1D7AFF] discuss:text-[#EF4444]" />
            <span data-testid="profile-post-count" className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-[13px] font-semibold">
              {loadingPosts ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : `${userPosts.length} Total Posts`}
            </span>
          </div>

          {!user?.verified && (
            <Button
              onClick={() => setShowVerificationModal(true)}
              variant="outline"
              className="mt-4 border-[#E63946] text-[#E63946] hover:bg-[#E63946]/10 dark:border-[#E63946] dark:hover:bg-[#E63946]/10 discuss:border-[#EF4444] discuss:text-[#EF4444] discuss:hover:bg-[#EF4444]/10"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Request Verification
            </Button>
          )}

          {/* User Admin Message */}
          {user?.admin_message && (
            <div className="mt-6">
              <UserAdminMessage message={user.admin_message} />
            </div>
          )}

          {/* ==================== PROFILE FIELDS ==================== */}
          <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-left space-y-4">
            
            {/* Loading indicator for profile data */}
            {loadingProfile && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#6275AF]" />
                <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs">Loading profile...</span>
              </div>
            )}

            {/* Full Name Section */}
            <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-4 rounded-lg discuss:border discuss:border-[#333333]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                  Full Name
                  <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs font-normal">(optional)</span>
                </label>
                {!editingFullName && profileData?.fullName && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded hover:bg-[#E2E8F0] dark:hover:bg-[#1E293B] discuss:hover:bg-[#1a1a1a] text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                      <DropdownMenuItem onClick={() => { setEditingFullName(true); setFullNameInput(profileData.fullName || ''); }} className="cursor-pointer text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] focus:bg-[#F5F5F7] dark:focus:bg-[#0F172A] discuss:focus:bg-[#262626]">
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteFullNameConfirm(true)} className="cursor-pointer text-[#EF4444] focus:bg-[#EF4444]/10 focus:text-[#EF4444]">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              {editingFullName ? (
                <div className="flex gap-2">
                  <Input 
                    value={fullNameInput} 
                    onChange={(e) => setFullNameInput(e.target.value)}
                    placeholder="Enter your full name"
                    className="flex-1 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm"
                  />
                  <Button onClick={handleSaveFullName} disabled={savingFullName || !fullNameInput.trim()} size="sm"
                    className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white">
                    {savingFullName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button onClick={() => setEditingFullName(false)} size="sm" variant="outline"
                    className="border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#6275AF]">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : profileData?.fullName ? (
                <p className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm">{profileData.fullName}</p>
              ) : (
                <button onClick={() => { setEditingFullName(true); setFullNameInput(''); }}
                  className="text-[#2563EB] discuss:text-[#EF4444] hover:underline text-sm flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add full name
                </button>
              )}
            </div>

            {/* Bio Section */}
            <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-4 rounded-lg discuss:border discuss:border-[#333333]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                  Bio
                  <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs font-normal">(max {BIO_CHAR_LIMIT} chars)</span>
                </label>
                {!editingBio && profileData?.bio && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded hover:bg-[#E2E8F0] dark:hover:bg-[#1E293B] discuss:hover:bg-[#1a1a1a] text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                      <DropdownMenuItem onClick={() => { setEditingBio(true); setBioInput(profileData.bio || ''); }} className="cursor-pointer text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] focus:bg-[#F5F5F7] dark:focus:bg-[#0F172A] discuss:focus:bg-[#262626]">
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteBioConfirm(true)} className="cursor-pointer text-[#EF4444] focus:bg-[#EF4444]/10 focus:text-[#EF4444]">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              {editingBio ? (
                <div className="space-y-2">
                  <Textarea 
                    value={bioInput} 
                    onChange={(e) => setBioInput(e.target.value.slice(0, BIO_CHAR_LIMIT))}
                    placeholder="Tell us about yourself..."
                    rows={3}
                    className="w-full bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${bioInput.length >= BIO_CHAR_LIMIT ? 'text-[#EF4444]' : 'text-[#6275AF] dark:text-[#94A3B8]'}`}>
                      {bioInput.length}/{BIO_CHAR_LIMIT}
                    </span>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveBio} disabled={savingBio || !bioInput.trim()} size="sm"
                        className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white">
                        {savingBio ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                      </Button>
                      <Button onClick={() => setEditingBio(false)} size="sm" variant="outline"
                        className="border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#6275AF]">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : profileData?.bio ? (
                <p className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm whitespace-pre-wrap">{profileData.bio}</p>
              ) : (
                <button onClick={() => { setEditingBio(true); setBioInput(''); }}
                  className="text-[#2563EB] discuss:text-[#EF4444] hover:underline text-sm flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add bio
                </button>
              )}
            </div>

            {/* Social Links Section */}
            <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-4 rounded-lg discuss:border discuss:border-[#333333]">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                  Social Links
                  <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs font-normal">(max {MAX_SOCIAL_LINKS})</span>
                </label>
                <span className="text-[#6275AF] dark:text-[#94A3B8] text-xs">
                  {profileData?.socialLinks?.length || 0}/{MAX_SOCIAL_LINKS}
                </span>
              </div>

              {/* Existing Links */}
              {profileData?.socialLinks?.length > 0 && (
                <div className="space-y-2 mb-3">
                  {profileData.socialLinks.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] p-2 rounded border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                      {editingLinkIndex === index ? (
                        <>
                          <Input 
                            value={editLinkName} 
                            onChange={(e) => setEditLinkName(e.target.value)}
                            placeholder="Link name"
                            className="flex-1 h-8 text-xs bg-transparent border-0 p-0"
                          />
                          <Input 
                            value={editLinkUrl} 
                            onChange={(e) => setEditLinkUrl(e.target.value)}
                            placeholder="URL"
                            className="flex-1 h-8 text-xs bg-transparent border-0 p-0"
                          />
                          <Button onClick={() => handleEditLink(index)} disabled={savingLink} size="sm" className="h-7 px-2 bg-[#2563EB] discuss:bg-[#EF4444]">
                            {savingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button onClick={() => setEditingLinkIndex(null)} size="sm" variant="ghost" className="h-7 px-2">
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 text-[#2563EB] discuss:text-[#60A5FA] hover:underline text-sm flex items-center gap-1">
                            {link.name}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-[#F5F5F7] dark:hover:bg-[#0F172A] discuss:hover:bg-[#262626] text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] transition-colors">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                              <DropdownMenuItem onClick={() => { setEditingLinkIndex(index); setEditLinkName(link.name); setEditLinkUrl(link.url); }} className="cursor-pointer text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] focus:bg-[#F5F5F7] dark:focus:bg-[#0F172A] discuss:focus:bg-[#262626]">
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeleteLinkConfirm(index)} className="cursor-pointer text-[#EF4444] focus:bg-[#EF4444]/10 focus:text-[#EF4444]">
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Link */}
              {addingLink ? (
                <div className="space-y-2 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] p-3 rounded border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <Input 
                    value={newLinkName} 
                    onChange={(e) => setNewLinkName(e.target.value)}
                    placeholder="Link name (e.g., LinkedIn, GitHub)"
                    className="w-full text-sm bg-transparent"
                  />
                  <Input 
                    value={newLinkUrl} 
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="URL (e.g., https://github.com/username)"
                    className="w-full text-sm bg-transparent"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button onClick={handleAddLink} disabled={savingLink || !newLinkName.trim() || !newLinkUrl.trim()} size="sm"
                      className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white">
                      {savingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Link'}
                    </Button>
                    <Button onClick={() => { setAddingLink(false); setNewLinkName(''); setNewLinkUrl(''); }} size="sm" variant="outline"
                      className="border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#6275AF]">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : !maxLinksReached ? (
                <button onClick={() => setAddingLink(true)}
                  className="text-[#2563EB] discuss:text-[#EF4444] hover:underline text-sm flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add social link
                </button>
              ) : (
                <p className="text-[#6275AF] dark:text-[#94A3B8] text-xs">Maximum links reached</p>
              )}
            </div>
          </div>
          {/* ==================== END PROFILE FIELDS ==================== */}

          <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm font-medium">Theme</span>
            </div>
            <ThemeSelector />
          </div>

          {/* Notification Settings */}
          <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
              <span className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm font-medium">Notifications</span>
            </div>
            <NotificationToggle />
          </div>

          <Button data-testid="profile-logout-btn" onClick={handleLogout} disabled={loggingOut}
            className="w-full bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-[#2563EB] discuss:bg-[#EF4444]/10 discuss:hover:bg-[#EF4444]/20 discuss:text-[#EF4444] font-semibold py-3 h-12 mt-5 transition-all">
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-2" /> Logout</>}
          </Button>
        </div>

        {/* ==================== FRIENDS SECTION ==================== */}
        <div className="mt-6">
          <button
            onClick={() => setShowFriends(!showFriends)}
            className="w-full flex items-center justify-between bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] px-5 py-4 hover:shadow-md dark:hover:shadow-none transition-all rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#10B981]/10 discuss:bg-[#10B981]/10 flex items-center justify-center rounded-lg relative">
                <Users className="w-4 h-4 text-[#10B981]" />
                {receivedRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#F59E0B] text-white text-[10px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1">
                    {receivedRequests.length}
                  </span>
                )}
              </div>
              <div className="text-left">
                <h2 className="text-[15px] font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">Friends</h2>
                <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-xs">
                  {friends.length} friend{friends.length !== 1 ? 's' : ''}
                  {receivedRequests.length > 0 && ` • ${receivedRequests.length} pending`}
                </p>
              </div>
            </div>
            {showFriends ? <ChevronUp className="w-5 h-5 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]" /> : <ChevronDown className="w-5 h-5 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]" />}
          </button>

          {showFriends && (
            <div className="mt-4 space-y-4">
              {/* Received Friend Requests */}
              {receivedRequests.length > 0 && (
                <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-[#92400E] dark:text-[#FCD34D] discuss:text-[#FCD34D] mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Friend Requests ({receivedRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {receivedRequests.map((request) => {
                      const reqUser = requestUserDetails[request.fromUserId];
                      const initials = (reqUser?.username || 'U').slice(0, 2).toUpperCase();
                      
                      return (
                        <div key={request.fromUserId} className="flex items-center justify-between bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] p-3 rounded-lg border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                          <button
                            onClick={() => navigate(`/user/${request.fromUserId}`)}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <UserAvatar
                              src={reqUser?.photo_url}
                              username={reqUser?.username || 'User'}
                              className="w-10 h-10"
                            />
                            <div className="text-left min-w-0">
                              <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm block truncate">
                                @{reqUser?.username || 'Unknown'}
                              </span>
                              <span className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-xs">
                                {new Date(request.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </button>
                          <div className="flex gap-2 shrink-0 ml-2">
                            <Button
                              onClick={() => handleAcceptRequest(request.fromUserId)}
                              disabled={processingRequest === request.fromUserId}
                              size="sm"
                              className="bg-[#10B981] hover:bg-[#059669] text-white h-8 px-3"
                            >
                              {processingRequest === request.fromUserId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button
                              onClick={() => handleDeclineRequest(request.fromUserId)}
                              disabled={processingRequest === request.fromUserId}
                              variant="outline"
                              size="sm"
                              className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/10 h-8 px-3"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sent Requests */}
              {sentRequests.length > 0 && (
                <div className="bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <h3 className="text-sm font-semibold text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Sent Requests ({sentRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {sentRequests.map((request) => {
                      const reqUser = requestUserDetails[request.toUserId];
                      const initials = (reqUser?.username || 'U').slice(0, 2).toUpperCase();
                      
                      return (
                        <div key={request.toUserId} className="flex items-center justify-between bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] p-3 rounded-lg border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                          <button
                            onClick={() => navigate(`/user/${request.toUserId}`)}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <UserAvatar
                              src={reqUser?.photo_url}
                              username={reqUser?.username || 'User'}
                              className="w-10 h-10"
                            />
                            <div className="text-left min-w-0">
                              <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm block truncate">
                                @{reqUser?.username || 'Unknown'}
                              </span>
                              <span className="text-[#F59E0B] text-xs">Pending</span>
                            </div>
                          </button>
                          <Button
                            onClick={() => handleCancelRequest(request.toUserId)}
                            disabled={processingRequest === request.toUserId}
                            variant="outline"
                            size="sm"
                            className="border-[#6275AF] text-[#6275AF] hover:bg-[#6275AF]/10 h-8 px-3 shrink-0 ml-2"
                          >
                            {processingRequest === request.toUserId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cancel'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Find Friends Search */}
              <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] mb-3 flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                  Find Friends
                </h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]" />
                  <Input
                    value={friendSearchQuery}
                    onChange={(e) => setFriendSearchQuery(e.target.value)}
                    placeholder="Search users by username..."
                    className="pl-10 bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] placeholder:text-[#6275AF] dark:placeholder:text-[#94A3B8] discuss:placeholder:text-[#9CA3AF] text-sm"
                  />
                  {friendSearchQuery && (
                    <button
                      onClick={() => setFriendSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6275AF] hover:text-[#0F172A] dark:hover:text-white discuss:hover:text-[#F5F5F5]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {searchingFriends ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6275AF]" />
                  </div>
                ) : friendSearchResults.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                    {friendSearchResults.map((searchUser) => (
                      <UserSearchResult
                        key={searchUser.id}
                        user={searchUser}
                        currentUserId={user?.id}
                        onClose={() => setFriendSearchQuery('')}
                      />
                    ))}
                  </div>
                ) : friendSearchQuery && !searchingFriends ? (
                  <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-sm text-center py-4">
                    No users found
                  </p>
                ) : null}
              </div>

              {/* Friends List */}
              {loadingFriends ? (
                <div className="flex flex-col items-center justify-center py-8 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-2" />
                  <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-sm">Loading friends list...</p>
                </div>
              ) : friends.length > 0 ? (
                <div className="space-y-4">
                  {/* Suggested Friends Section */}
                  {suggestedFriends.length > 0 && (
                    <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                      <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] mb-3 flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                        Suggested Friends
                      </h3>
                      {loadingSuggestions ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB] discuss:text-[#EF4444]" />
                          <span className="ml-2 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-sm">Finding suggestions...</span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
                          {suggestedFriends.map((suggested) => {
                            const initials = (suggested.username || 'U').slice(0, 2).toUpperCase();
                            
                            return (
                              <div key={suggested.id} className="flex items-center justify-between bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-3 rounded-lg">
                                <button
                                  onClick={() => navigate(`/user/${suggested.id}`)}
                                  className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                  <UserAvatar
                                    src={suggested?.photo_url}
                                    username={suggested?.username || 'User'}
                                    className="w-10 h-10"
                                  />
                                  <div className="text-left min-w-0">
                                    <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm block truncate flex items-center gap-1">
                                      @{suggested.username}
                                      {suggested.verified && <VerifiedBadge size="xs" />}
                                    </span>
                                    {suggested.mutualCount > 0 && (
                                      <span className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-xs">
                                        {suggested.mutualCount} mutual friend{suggested.mutualCount !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                </button>
                                <Button
                                  onClick={() => navigate(`/user/${suggested.id}`)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-3 shrink-0 ml-2 border-[#2563EB] discuss:border-[#EF4444] text-[#2563EB] discuss:text-[#EF4444] hover:bg-[#2563EB]/10 discuss:hover:bg-[#EF4444]/10"
                                >
                                  <UserPlus className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Your Friends */}
                  <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                  <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#10B981]" />
                    Your Friends ({friends.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                    {friends.map((friend) => {
                      const initials = (friend.username || 'U').slice(0, 2).toUpperCase();
                      
                      return (
                        <div key={friend.id} className="flex items-center justify-between bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-3 rounded-lg">
                          <button
                            onClick={() => navigate(`/user/${friend.id}`)}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <UserAvatar
                              src={friend?.photo_url}
                              username={friend?.username || 'User'}
                              className="w-10 h-10"
                            />
                            <div className="text-left min-w-0">
                              <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm block truncate">
                                @{friend.username}
                              </span>
                              {friend.verified && <VerifiedBadge size="xs" />}
                            </div>
                          </button>
                          <Button
                            onClick={() => navigate(`/chat/${friend.id}`)}
                            size="sm"
                            className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white h-8 px-3 shrink-0 ml-2"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Suggested Friends for users without friends */}
                  {suggestedFriends.length > 0 && (
                    <div className="bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                      <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] mb-3 flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
                        People You May Know
                      </h3>
                      {loadingSuggestions ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB] discuss:text-[#EF4444]" />
                          <span className="ml-2 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-sm">Finding people...</span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
                          {suggestedFriends.map((suggested) => {
                            const initials = (suggested.username || 'U').slice(0, 2).toUpperCase();
                            
                            return (
                              <div key={suggested.id} className="flex items-center justify-between bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#262626] p-3 rounded-lg">
                                <button
                                  onClick={() => navigate(`/user/${suggested.id}`)}
                                  className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                  {suggested.photo_url ? (
                                    <UserAvatar src={suggested.photo_url} username={suggested.username} className="w-10 h-10 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] discuss:from-[#EF4444] discuss:to-[#F59E0B] flex items-center justify-center">
                                      <span className="text-white text-sm font-bold">{initials}</span>
                                    </div>
                                  )}
                                  <div className="text-left min-w-0">
                                    <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-sm block truncate flex items-center gap-1">
                                      @{suggested.username}
                                      {suggested.verified && <VerifiedBadge size="xs" />}
                                    </span>
                                  </div>
                                </button>
                                <Button
                                  onClick={() => navigate(`/user/${suggested.id}`)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-3 shrink-0 ml-2 border-[#2563EB] discuss:border-[#EF4444] text-[#2563EB] discuss:text-[#EF4444] hover:bg-[#2563EB]/10 discuss:hover:bg-[#EF4444]/10"
                                >
                                  <UserPlus className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="text-center py-8 bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] rounded-xl border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]">
                    <Users className="w-10 h-10 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] mx-auto mb-3" />
                    <h3 className="text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] font-semibold mb-1">No friends yet</h3>
                    <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-sm">
                      Search for users above to connect
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* ==================== END FRIENDS SECTION ==================== */}

        {/* Your Posts Section */}
        <div className="mt-6">
          <button
            data-testid="your-posts-toggle"
            onClick={() => setShowPosts(!showPosts)}
            className="w-full flex items-center justify-between bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] px-5 py-4 hover:shadow-md dark:hover:shadow-none transition-all rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#2563EB]/10 discuss:bg-[#EF4444]/10 flex items-center justify-center rounded-lg">
                <FileText className="w-4 h-4 text-[#2563EB] discuss:text-[#EF4444]" />
              </div>
              <div className="text-left">
                <h2 className="text-[15px] font-bold text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">Your Posts</h2>
                <p className="text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] text-xs">{userPosts.length} post{userPosts.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {showPosts ? <ChevronUp className="w-5 h-5 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]" /> : <ChevronDown className="w-5 h-5 text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF]" />}
          </button>

          {showPosts && (
            <div className="mt-4 space-y-4">
              {/* Filter bar */}
              <div data-testid="post-filter-bar" className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-xl px-3 py-2.5">
                <Filter className="w-3.5 h-3.5 text-[#6275AF] dark:text-[#94A3B8]" />
                <select
                  data-testid="filter-type-select"
                  value={filterType}
                  onChange={(e) => { setFilterType(e.target.value); setFilterMonth(''); setFilterYear(''); }}
                  className="bg-[#F5F5F7] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] rounded-lg px-2.5 py-1.5 text-[12px] font-medium outline-none focus:border-[#2563EB]"
                >
                  <option value="all">All Posts</option>
                  <option value="this_month">This Month</option>
                  <option value="month">Select Month</option>
                  <option value="year">Select Year</option>
                </select>

                {filterType === 'month' && (
                  <>
                    <select
                      data-testid="filter-month-select"
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="bg-[#F5F5F7] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] rounded-lg px-2.5 py-1.5 text-[12px] font-medium outline-none focus:border-[#2563EB]"
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select
                      data-testid="filter-month-year-select"
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="bg-[#F5F5F7] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] rounded-lg px-2.5 py-1.5 text-[12px] font-medium outline-none focus:border-[#2563EB]"
                    >
                      <option value="">Year</option>
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </>
                )}

                {filterType === 'year' && (
                  <select
                    data-testid="filter-year-select"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="bg-[#F5F5F7] dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] rounded-lg px-2.5 py-1.5 text-[12px] font-medium outline-none focus:border-[#2563EB]"
                  >
                    <option value="">Year</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}

                {filterType !== 'all' && (
                  <span className="text-[#6275AF] dark:text-[#94A3B8] text-[11px] ml-auto">
                    {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {loadingPosts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6275AF]" />
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E2E8F0] dark:border-[#334155]">
                  <Calendar className="w-8 h-8 text-[#6275AF] dark:text-[#94A3B8] mx-auto mb-2" />
                  <p className="text-[#6275AF] dark:text-[#94A3B8] text-[13px]">
                    {filterType === 'all' ? "You haven't created any posts yet." : 'No posts found for this period.'}
                  </p>
                </div>
              ) : (
                filteredPosts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUser={user}
                    onDeleted={handlePostDeleted}
                    onUpdated={handlePostUpdated}
                    onVoteChanged={handleVoteChanged}
                    onTagClick={() => {}}
                  />
                ))
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[#94A3B8] dark:text-[#6275AF] text-xs mt-6">
          Managed by <span className="font-semibold text-[#BC4800]">&lt;discuss&gt;</span>
        </p>
      </div>

      <VerificationRequestModal 
        open={showVerificationModal} 
        onClose={() => setShowVerificationModal(false)}
        user={user}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        open={showImagePreview}
        onClose={() => setShowImagePreview(false)}
        imageUrl={user?.photo_url}
        altText={user?.username}
      />

      {/* Delete Full Name Confirmation */}
      <AlertDialog open={deleteFullNameConfirm} onOpenChange={setDeleteFullNameConfirm}>
        <AlertDialogContent className="dark:bg-[#1E293B] dark:border-[#334155] discuss:bg-[#262626] discuss:border-[#333333]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">Remove full name?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
              This will remove your full name from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#F1F5F9] dark:border-[#334155] discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFullName} disabled={savingFullName} className="bg-[#EF4444] text-white hover:bg-[#DC2626]">
              {savingFullName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Bio Confirmation */}
      <AlertDialog open={deleteBioConfirm} onOpenChange={setDeleteBioConfirm}>
        <AlertDialogContent className="dark:bg-[#1E293B] dark:border-[#334155] discuss:bg-[#262626] discuss:border-[#333333]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">Remove bio?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
              This will remove your bio from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#F1F5F9] dark:border-[#334155] discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBio} disabled={savingBio} className="bg-[#EF4444] text-white hover:bg-[#DC2626]">
              {savingBio ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Link Confirmation */}
      <AlertDialog open={deleteLinkConfirm !== null} onOpenChange={(v) => { if (!v) setDeleteLinkConfirm(null); }}>
        <AlertDialogContent className="dark:bg-[#1E293B] dark:border-[#334155] discuss:bg-[#262626] discuss:border-[#333333]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-[#F1F5F9] discuss:text-[#F5F5F5]">Remove link?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
              This will remove this social link from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#F1F5F9] dark:border-[#334155] discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDeleteLink(deleteLinkConfirm)} disabled={savingLink} className="bg-[#EF4444] text-white hover:bg-[#DC2626]">
              {savingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Share Modal */}
      <ProfileShareModal 
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        username={user?.username}
      />

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
