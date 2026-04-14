import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUser } from '@/lib/db';
import { getFriendsWithDetails } from '@/lib/relationshipsDb';
import { getRelationshipStatus, sendFriendRequest, cancelFriendRequest, unfollowUser } from '@/lib/relationshipsDb';
import {
  getGroupInfo,
  getGroupMembers,
  subscribeToGroupMembers,
  isGroupAdmin,
  isGroupMember,
  removeMemberFromGroup,
  promoteMemberToAdmin,
  demoteAdminToMember,
  leaveGroup,
  deleteGroup,
  updateGroupSettings,
  addMemberToGroup,
  GROUP_STATUS,
  GROUP_TYPE,
  MEMBER_ROLE
} from '@/lib/groupsDb';
import Header from '@/components/Header';
import VerifiedBadge from '@/components/VerifiedBadge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, Users, Shield, UserMinus, Crown, LogOut, Trash2, Settings, Clock, UserPlus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function GroupInfoPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [groupInfo, setGroupInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [userDetails, setUserDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, data: null });
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [relationshipStatuses, setRelationshipStatuses] = useState({});

  useEffect(() => {
    if (!user?.id || !groupId) return;

    const loadGroupInfo = async () => {
      try {
        const info = await getGroupInfo(groupId);
        setGroupInfo(info);

        const memberStatus = await isGroupMember(groupId, user.id);
        setIsMember(memberStatus);

        const adminStatus = await isGroupAdmin(groupId, user.id);
        setIsAdmin(adminStatus);
      } catch (error) {
        console.error('Error loading group info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGroupInfo();

    const unsubscribe = subscribeToGroupMembers(groupId, async (membersList) => {
      setMembers(membersList);
      
      const details = {};
      for (const member of membersList) {
        try {
          const userData = await getUser(member.userId);
          if (userData) details[member.userId] = userData;
        } catch (err) {
          console.error('Error loading user:', err);
        }
      }
      setUserDetails(details);
    });

    return () => unsubscribe();
  }, [user?.id, groupId]);

  const handleRemoveMember = async (userId) => {
    try {
      await removeMemberFromGroup(groupId, userId, user.id);
      toast.success('Member removed successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to remove member');
    } finally {
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handlePromote = async (userId) => {
    try {
      await promoteMemberToAdmin(groupId, userId, user.id);
      toast.success('Member promoted to admin');
    } catch (error) {
      toast.error(error.message || 'Failed to promote member');
    } finally {
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDemote = async (userId) => {
    try {
      await demoteAdminToMember(groupId, userId, user.id);
      toast.success('Admin demoted to member');
    } catch (error) {
      toast.error(error.message || 'Failed to demote admin');
    } finally {
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleLeaveGroup = async () => {
    try {
      await leaveGroup(groupId, user.id);
      toast.success('Left group successfully');
      navigate('/chat');
    } catch (error) {
      toast.error(error.message || 'Failed to leave group');
    } finally {
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteGroup(groupId, user.id);
      toast.success('Group deleted successfully');
      navigate('/chat');
    } catch (error) {
      toast.error(error.message || 'Failed to delete group');
    } finally {
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleToggleAdminOnly = async (enabled) => {
    try {
      await updateGroupSettings(groupId, { 
        ...groupInfo.settings, 
        adminOnlyMessaging: enabled 
      });
      setGroupInfo({ ...groupInfo, settings: { ...groupInfo.settings, adminOnlyMessaging: enabled } });
      toast.success(enabled ? 'Admin-only messaging enabled' : 'Admin-only messaging disabled');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const handleToggleAutoDelete = async (enabled) => {
    try {
      await updateGroupSettings(groupId, { 
        ...groupInfo.settings, 
        autoDelete24h: enabled 
      });
      setGroupInfo({ ...groupInfo, settings: { ...groupInfo.settings, autoDelete24h: enabled } });
      toast.success(enabled ? '24h auto-delete enabled' : '24h auto-delete disabled');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
        <Header />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">Loading group info...</p>
        </div>
      </div>
    );
  }

  const isDeleted = groupInfo?.status === GROUP_STATUS.DELETED;
  const adminMembers = members.filter(m => m.role === MEMBER_ROLE.ADMIN);
  const regularMembers = members.filter(m => m.role === MEMBER_ROLE.MEMBER);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/group/${groupId}`)}
            className="p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
          </button>
          <h1 className="font-heading text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
            Group Info
          </h1>
        </div>

        {/* Group Details */}
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">{groupInfo?.name?.slice(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
                {groupInfo?.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  groupInfo?.type === 'public' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                }`}>
                  {groupInfo?.type === 'public' ? 'Public' : 'Private'}
                </span>
                {isDeleted && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    Deleted
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">
            <Users className="w-4 h-4 inline mr-1" />
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>

        {/* Settings (Admin Only) */}
        {isAdmin && !isDeleted && (
          <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
            <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Group Settings
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-medium">
                    Admin-only messaging
                  </Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Only admins can send messages</p>
                </div>
                <Switch
                  checked={groupInfo?.settings?.adminOnlyMessaging || false}
                  onCheckedChange={handleToggleAdminOnly}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-medium flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    24h auto-delete
                  </Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Automatically delete messages after 24 hours</p>
                </div>
                <Switch
                  checked={groupInfo?.settings?.autoDelete24h || false}
                  onCheckedChange={handleToggleAutoDelete}
                />
              </div>
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
          <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-4">Members</h3>
          
          {/* Admins */}
          {adminMembers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Admins</p>
              <div className="space-y-2">
                {adminMembers.map(member => {
                  const details = userDetails[member.userId];
                  return (
                    <div key={member.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]">
                      <div className="flex items-center gap-3">
                        {details?.photo_url ? (
                          <img referrerPolicy="no-referrer" src={details.photo_url} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{details?.username?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
                              @{details?.username || 'User'}
                            </span>
                            {details?.verified && <VerifiedBadge size="sm" />}
                          </div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            Admin
                          </span>
                        </div>
                      </div>
                      {isAdmin && member.userId !== user.id && !isDeleted && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDialog({ open: true, action: 'demote', data: member.userId })}
                          className="text-xs"
                        >
                          Demote
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Members */}
          {regularMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Members</p>
              <div className="space-y-2">
                {regularMembers.map(member => {
                  const details = userDetails[member.userId];
                  return (
                    <div key={member.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]">
                      <div className="flex items-center gap-3">
                        {details?.photo_url ? (
                          <img referrerPolicy="no-referrer" src={details.photo_url} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{details?.username?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">
                              @{details?.username || 'User'}
                            </span>
                            {details?.verified && <VerifiedBadge size="sm" />}
                          </div>
                        </div>
                      </div>
                      {isAdmin && !isDeleted && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmDialog({ open: true, action: 'promote', data: member.userId })}
                            className="text-xs"
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            Promote
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmDialog({ open: true, action: 'remove', data: member.userId })}
                            className="text-xs text-red-600"
                          >
                            <UserMinus className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {isMember && !isDeleted && (
          <div className="space-y-2">
            <Button
              onClick={() => setConfirmDialog({ open: true, action: 'leave' })}
              variant="outline"
              className="w-full border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave Group
            </Button>
            
            {isAdmin && (
              <Button
                onClick={() => setConfirmDialog({ open: true, action: 'delete' })}
                variant="outline"
                className="w-full border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Group
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, data: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'remove' && 'Remove Member?'}
              {confirmDialog.action === 'promote' && 'Promote to Admin?'}
              {confirmDialog.action === 'demote' && 'Demote Admin?'}
              {confirmDialog.action === 'leave' && 'Leave Group?'}
              {confirmDialog.action === 'delete' && 'Delete Group?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'remove' && 'This member will be removed from the group.'}
              {confirmDialog.action === 'promote' && 'This member will be promoted to admin.'}
              {confirmDialog.action === 'demote' && 'This admin will be demoted to member.'}
              {confirmDialog.action === 'leave' && 'You will leave this group. You can rejoin if invited.'}
              {confirmDialog.action === 'delete' && 'This group will be deleted for all members. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog.action === 'remove') handleRemoveMember(confirmDialog.data);
                else if (confirmDialog.action === 'promote') handlePromote(confirmDialog.data);
                else if (confirmDialog.action === 'demote') handleDemote(confirmDialog.data);
                else if (confirmDialog.action === 'leave') handleLeaveGroup();
                else if (confirmDialog.action === 'delete') handleDeleteGroup();
              }}
              className={confirmDialog.action === 'delete' || confirmDialog.action === 'remove' || confirmDialog.action === 'leave' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
