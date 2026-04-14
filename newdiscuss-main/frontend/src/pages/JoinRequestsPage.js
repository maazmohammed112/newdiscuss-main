import UserAvatar from '@/components/UserAvatar';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHighlights } from '@/contexts/HighlightsContext';
import { getUser } from '@/lib/db';
import { 
  getUserGroups, 
  getGroupJoinRequests, 
  acceptJoinRequest, 
  rejectJoinRequest,
  getUserGroupInvites,
  acceptGroupInvite,
  rejectGroupInvite,
  getGroupInfo
} from '@/lib/groupsDb';
import Header from '@/components/Header';
import VerifiedBadge from '@/components/VerifiedBadge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';


export default function JoinRequestsPage() {
  const { user } = useAuth();
  const { markGroupRequestsViewed, pendingGroupRequests } = useHighlights();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  
  // Requests to join groups you admin
  const [groups, setGroups] = useState([]);
  const [requests, setRequests] = useState({});
  const [userDetails, setUserDetails] = useState({});
  
  // Invites to join groups
  const [invites, setInvites] = useState([]);
  const [inviteGroupDetails, setInviteGroupDetails] = useState({});
  const [adminDetails, setAdminDetails] = useState({});

  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        // Load admin requests (User -> Admin)
        const userGroups = await getUserGroups(user.id);
        setGroups(userGroups);

        const allRequests = {};
        const details = {};

        for (const group of userGroups) {
          if (group.isMember) {
            const groupRequests = await getGroupJoinRequests(group.groupId);
            if (groupRequests.length > 0) {
              allRequests[group.groupId] = groupRequests;

              for (const req of groupRequests) {
                try {
                  const userData = await getUser(req.userId);
                  if (userData) details[req.userId] = userData;
                } catch (err) {
                  console.error('Error loading user:', err);
                }
              }
            }
          }
        }
        setRequests(allRequests);

        // Load invites (Admin -> User)
        const userInvites = await getUserGroupInvites(user.id);
        setInvites(userInvites);
        
        const gDetails = {};
        for (const inv of userInvites) {
          try {
            const gInfo = await getGroupInfo(inv.groupId);
            if (gInfo) gDetails[inv.groupId] = gInfo;
            
            if (inv.invitedBy) {
              const aInfo = await getUser(inv.invitedBy);
              if (aInfo) details[inv.invitedBy] = aInfo;
            }
          } catch (err) {
            console.error('Error loading invite details:', err);
          }
        }
        setInviteGroupDetails(gDetails);
        setUserDetails(prev => ({ ...prev, ...details }));

      } catch (error) {
        console.error('Error loading join requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  useEffect(() => {
    // Whenever pendingGroupRequests changes, or on mount, if we are on this page, it counts as viewed
    markGroupRequestsViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroupRequests]);

  const handleAcceptRequest = async (groupId, userId) => {
    try {
      await acceptJoinRequest(groupId, userId, user.id);
      setRequests(prev => ({
        ...prev,
        [groupId]: prev[groupId].filter(r => r.userId !== userId)
      }));
      toast.success('Request accepted');
    } catch (error) {
      toast.error('Failed to accept request');
    }
  };

  const handleRejectRequest = async (groupId, userId) => {
    try {
      await rejectJoinRequest(groupId, userId, user.id);
      setRequests(prev => ({
        ...prev,
        [groupId]: prev[groupId].filter(r => r.userId !== userId)
      }));
      toast.success('Request rejected');
    } catch (error) {
      toast.error('Failed to reject request');
    }
  };

  const handleAcceptInvite = async (groupId) => {
    try {
      await acceptGroupInvite(groupId, user.id);
      setInvites(prev => prev.filter(inv => inv.groupId !== groupId));
      toast.success('Joined group!');
    } catch (error) {
      toast.error('Failed to join group');
    }
  };

  const handleRejectInvite = async (groupId) => {
    try {
      await rejectGroupInvite(groupId, user.id);
      setInvites(prev => prev.filter(inv => inv.groupId !== groupId));
      toast.success('Invite rejected');
    } catch (error) {
      toast.error('Failed to reject invite');
    }
  };

  const totalRequests = Object.values(requests).reduce((sum, arr) => sum + arr.length, 0) + invites.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
        <Header />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
          </button>
          <h1 className="font-heading text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
            View / Manage Requests
          </h1>
          {totalRequests > 0 && (
            <span className="bg-[#EF4444] text-white text-xs font-bold px-2 py-1 rounded-full">
              {totalRequests}
            </span>
          )}
        </div>

        {totalRequests === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]">
            <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]">
              No pending requests
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* User -> Admin Join Requests */}
            {Object.entries(requests).some(([, arr]) => arr.length > 0) && (
              <div>
                <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">Requests to Join Your Groups</h2>
                <div className="space-y-4">
                  {Object.entries(requests).map(([groupId, groupRequests]) => {
                    if (groupRequests.length === 0) return null;
                    const group = groups.find(g => g.groupId === groupId);
                    
                    return (
                      <div key={groupId} className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-4">
                        <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-3">
                          {group?.groupName}
                        </h3>
                        <div className="space-y-2">
                          {groupRequests.map(request => {
                            const details = userDetails[request.userId];
                            return (
                              <div key={request.userId} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-700 discuss:bg-[#262626] rounded-lg">
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    src={details?.photo_url}
                                    username={details?.username || 'User'}
                                    className="w-10 h-10"
                                  />
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => navigate(`/user/${request.userId}`, { state: { from: location.pathname } })} className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] hover:underline text-left">
                                        @{details?.username || 'User'}
                                      </button>
                                      {details?.verified && <VerifiedBadge size="sm" />}
                                    </div>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                      {new Date(request.requestedAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleAcceptRequest(groupId, request.userId)} className="bg-green-600 hover:bg-green-700 text-white">
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleRejectRequest(groupId, request.userId)} className="text-red-600 border-red-200">
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Admin -> User Invites */}
            {invites.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">Group Invites</h2>
                <div className="space-y-3">
                  {invites.map(inv => {
                    const gInfo = inviteGroupDetails[inv.groupId];
                    const adminInfo = userDetails[inv.invitedBy];
                    return (
                      <div key={inv.groupId} className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
                            {gInfo?.name || 'Loading group...'}
                          </h3>
                          <p className="text-sm flex items-center gap-1 mt-1">
                            <span className="text-neutral-500 dark:text-neutral-400">Invited by </span>
                            <button onClick={() => adminInfo?.id && navigate(`/user/${adminInfo.id}`, { state: { from: location.pathname } })} className="font-medium text-[#2563EB] discuss:text-[#EF4444] hover:underline">
                              @{adminInfo?.username || 'Admin'}
                            </button>
                            {adminInfo?.verified && <VerifiedBadge size="sm" />}
                          </p>
                          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                            {new Date(inv.invitedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAcceptInvite(inv.groupId)} className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none">
                            <Check className="w-4 h-4 mr-1" /> Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRejectInvite(inv.groupId)} className="text-red-600 border-red-200 flex-1 sm:flex-none">
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
