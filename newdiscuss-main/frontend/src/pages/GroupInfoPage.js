import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUser, getAllUsers } from '@/lib/db';
import { getFriendsWithDetails } from '@/lib/relationshipsDb';
import {
  getGroupInfo, getGroupMembers, subscribeToGroupMembers, isGroupAdmin, isGroupMember,
  removeMemberFromGroup, promoteMemberToAdmin, demoteAdminToMember, leaveGroup, deleteGroup,
  updateGroupSettings, addMemberToGroup, deleteChatLocally,
  GROUP_STATUS, GROUP_TYPE, MEMBER_ROLE
} from '@/lib/groupsDb';
import Header from '@/components/Header';
import VerifiedBadge from '@/components/VerifiedBadge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Loader2, Users, Shield, UserMinus, Crown, LogOut, Trash2, Settings, Clock, UserPlus, Search, Share2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

// Function to delete all group messages (admin only)
const deleteAllGroupMessages = async (groupId, userId) => {
  try {
    const { fourthDatabase, ref, get, remove, update } = await import('@/lib/firebaseFourth');
    if (!fourthDatabase) throw new Error('Database not available');
    
    // Remove all messages
    const messagesRef = ref(fourthDatabase, `groups/${groupId}/messages`);
    await remove(messagesRef);
    
    // Update all members' last message
    const membersRef = ref(fourthDatabase, `groups/${groupId}/members`);
    const membersSnap = await get(membersRef);
    if (membersSnap.exists()) {
      const members = membersSnap.val();
      for (const uid of Object.keys(members)) {
        const userGroupRef = ref(fourthDatabase, `userGroups/${uid}/${groupId}`);
        await update(userGroupRef, { lastMessage: '', unreadCount: 0 });
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting all messages:', error);
    throw error;
  }
};

export default function GroupInfoPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [groupInfo, setGroupInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [userDetails, setUserDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, data: null });
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [groupShareCopied, setGroupShareCopied] = useState(false);

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
        console.error('Error:', error);
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
          console.error('Error:', err);
        }
      }
      setUserDetails(details);
    });

    return () => unsubscribe();
  }, [user?.id, groupId]);

  const loadAvailableUsers = async () => {
    try {
      const memberIds = members.map(m => m.userId);
      
      if (groupInfo?.type === GROUP_TYPE.PRIVATE) {
        const friendsList = await getFriendsWithDetails(user.id);
        const nonMembers = friendsList.filter(f => !memberIds.includes(f.id));
        setAvailableUsers(nonMembers);
      } else {
        const allUsersList = await getAllUsers();
        const nonMembers = allUsersList.filter(u => !memberIds.includes(u.id) && u.id !== user.id);
        setAvailableUsers(nonMembers);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAddMember = async (userId) => {
    try {
      const { getRelationshipStatus, RELATIONSHIP_STATUS } = await import('@/lib/relationshipsDb');
      const { sendGroupInvite } = await import('@/lib/groupsDb');
      
      const status = await getRelationshipStatus(user.id, userId);
      
      if (status === RELATIONSHIP_STATUS.FRIENDS) {
        await addMemberToGroup(groupId, userId, MEMBER_ROLE.MEMBER, user.id);
        toast.success('Member added automatically because you are friends.');
      } else {
        await sendGroupInvite(groupId, userId, user.id);
        toast.success('Join request sent! User must accept to join as they are not on your friend list.');
      }
      setAvailableUsers(prev => prev.filter(u => u.id !== userId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await removeMemberFromGroup(groupId, userId, user.id);
      toast.success('Member removed');
      setConfirmDialog({ open: false, action: null, data: null });
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handlePromote = async (userId) => {
    try {
      await promoteMemberToAdmin(groupId, userId, user.id);
      toast.success('Promoted');
      setConfirmDialog({ open: false, action: null, data: null });
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDemote = async (userId) => {
    try {
      await demoteAdminToMember(groupId, userId, user.id);
      toast.success('Demoted');
      setConfirmDialog({ open: false, action: null, data: null });
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleLeaveGroup = async () => {
    try {
      // Check if user is the only admin
      const admins = members.filter(m => m.role === MEMBER_ROLE.ADMIN);
      if (admins.length === 1 && admins[0].userId === user.id && members.length > 1) {
        toast.error('Assign at least one admin or delete the group before leaving');
        setConfirmDialog({ open: false, action: null, data: null });
        return;
      }
      
      await leaveGroup(groupId, user.id);
      toast.success('Left group');
      navigate('/chat');
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDeleteAllMessages = async () => {
    try {
      await deleteAllGroupMessages(groupId, user.id);
      toast.success('All messages deleted for everyone');
      setConfirmDialog({ open: false, action: null, data: null });
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDeleteChat = async () => {
    try {
      await deleteChatLocally(groupId, user.id);
      toast.success('Chat deleted from your list');
      navigate('/chat');
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteGroup(groupId, user.id);
      toast.success('Group deleted for everyone');
      navigate('/chat');
    } catch (error) {
      toast.error(error.message);
      setConfirmDialog({ open: false, action: null, data: null });
    }
  };

  const handleUserClick = (userId) => {
    if (userId === user.id) {
      navigate('/profile');
    } else {
      navigate(`/user/${userId}`, { state: { from: location.pathname } });
    }
  };

  const handleGroupShare = async () => {
    const shareMessage = `Join this group on Discuss: ${groupInfo?.name}. Shared by ${user?.username || 'a friend'}.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: groupInfo?.name, text: shareMessage });
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(shareMessage);
        setGroupShareCopied(true);
        toast.success('Group invite link copied!');
        setTimeout(() => setGroupShareCopied(false), 2500);
      } catch {
        toast.error('Failed to copy');
      }
    }
  };

  const handleGroupCopy = async () => {
    const shareMessage = `Join this group on Discuss: ${groupInfo?.name}. Shared by ${user?.username || 'a friend'}.`;
    try {
      await navigator.clipboard.writeText(shareMessage);
      setGroupShareCopied(true);
      toast.success('Invite message copied!');
      setTimeout(() => setGroupShareCopied(false), 2500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
        <Header />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-3" />
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const isDeleted = groupInfo?.status === GROUP_STATUS.DELETED;
  const adminMembers = members.filter(m => m.role === MEMBER_ROLE.ADMIN);
  const regularMembers = members.filter(m => m.role === MEMBER_ROLE.MEMBER);
  
  const filteredUsers = availableUsers.filter(u =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/group/${groupId}`)} className="p-2 rounded-[6px] hover:bg-white dark:hover:bg-neutral-800 discuss:hover:bg-[#1a1a1a] transition-colors border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]">
            <ArrowLeft className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
          </button>
          <h1 className="font-heading text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">Group Info</h1>
        </div>

        {/* Group Info Card */}
        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">{groupInfo?.name?.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">{groupInfo?.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${groupInfo?.type === 'public' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'}`}
                  style={document.documentElement.classList.contains('discuss-black')
                    ? groupInfo?.type === 'public'
                      ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#34D399' }
                      : { backgroundColor: 'rgba(112,0,255,0.18)', color: '#C084FC' }
                    : {}}
                >
                  {groupInfo?.type === 'public' ? 'Public' : 'Private'}
                </span>
                {isDeleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Deleted</span>}
              </div>
            </div>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-0">
            <Users className="w-4 h-4 inline mr-1" />{members.length} {members.length === 1 ? 'member' : 'members'}
          </p>

          {/* Share button — public groups only */}
          {groupInfo?.type === 'public' && !isDeleted && (
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700 discuss:border-[#2a2a2a] flex items-center gap-2">
              <button
                onClick={handleGroupShare}
                data-testid="group-share-btn"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-[8px] bg-[#2563EB]/8 dark:bg-[#2563EB]/10 discuss:bg-[#EF4444]/10 border border-[#2563EB]/20 dark:border-[#2563EB]/30 discuss:border-[#EF4444]/20 text-[#2563EB] dark:text-[#60A5FA] discuss:text-[#EF4444] text-sm font-medium hover:bg-[#2563EB]/15 dark:hover:bg-[#2563EB]/20 discuss:hover:bg-[#EF4444]/15 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share Group
              </button>
              <button
                onClick={handleGroupCopy}
                data-testid="group-copy-btn"
                title="Copy invite message"
                className="flex items-center justify-center p-2.5 rounded-[8px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] hover:bg-neutral-50 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626] transition-all"
              >
                {groupShareCopied
                  ? <Check className="w-4 h-4 text-[#10B981]" />
                  : <Copy className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />}
              </button>
            </div>
          )}
        </div>

        {isAdmin && !isDeleted && (
          <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
            <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />Group Settings
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-medium">Admin-only messaging</Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Only admins can send messages</p>
                </div>
                <div style={document.documentElement.classList.contains('discuss-black') ? { '--switch-bg-off': '#2A2A38', '--switch-bg-on': '#FF007F' } : {}}>
                  <Switch 
                    checked={groupInfo?.settings?.adminOnlyMessaging || false} 
                    onCheckedChange={async (v) => {
                      await updateGroupSettings(groupId, { ...groupInfo.settings, adminOnlyMessaging: v });
                      setGroupInfo({ ...groupInfo, settings: { ...groupInfo.settings, adminOnlyMessaging: v } });
                      toast.success(v ? 'Enabled' : 'Disabled');
                    }}
                    style={document.documentElement.classList.contains('discuss-black') ? {
                      backgroundColor: groupInfo?.settings?.adminOnlyMessaging ? '#FF007F' : '#2A2A38',
                      borderColor: groupInfo?.settings?.adminOnlyMessaging ? '#FF007F' : 'rgba(255,0,127,0.3)',
                    } : {}}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-medium flex items-center gap-1"><Clock className="w-4 h-4" />24h auto-delete</Label>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Auto-delete messages after 24 hours</p>
                </div>
                <div style={document.documentElement.classList.contains('discuss-black') ? { '--switch-bg-off': '#2A2A38', '--switch-bg-on': '#FF007F' } : {}}>
                  <Switch 
                    checked={groupInfo?.settings?.autoDelete24h || false} 
                    onCheckedChange={async (v) => {
                      await updateGroupSettings(groupId, { ...groupInfo.settings, autoDelete24h: v });
                      setGroupInfo({ ...groupInfo, settings: { ...groupInfo.settings, autoDelete24h: v } });
                      toast.success(v ? 'Enabled' : 'Disabled');
                    }}
                    style={document.documentElement.classList.contains('discuss-black') ? {
                      backgroundColor: groupInfo?.settings?.autoDelete24h ? '#FF007F' : '#2A2A38',
                      borderColor: groupInfo?.settings?.autoDelete24h ? '#FF007F' : 'rgba(255,0,127,0.3)',
                    } : {}}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">Members</h3>
            {isAdmin && !isDeleted && (
              <Button size="sm" onClick={() => { setAddMembersOpen(true); loadAvailableUsers(); }} className="bg-[#2563EB] discuss:bg-[#EF4444] text-white">
                <UserPlus className="w-4 h-4 mr-1" />Add
              </Button>
            )}
          </div>
          
          {adminMembers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-neutral-500 uppercase mb-2">Admins</p>
              <div className="space-y-2">
                {adminMembers.map(member => {
                  const details = userDetails[member.userId];
                  return (
                    <div key={member.userId} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]">
                      <button onClick={() => handleUserClick(member.userId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        {details?.photo_url ? <img referrerPolicy="no-referrer" src={details.photo_url} alt="" className="w-10 h-10 rounded-full shrink-0" /> : (
                          <div className="w-10 h-10 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">{details?.username?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] truncate">@{details?.username || 'User'}</span>
                            {details?.verified && <VerifiedBadge size="sm" />}
                          </div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><Crown className="w-3 h-3" />Admin</span>
                        </div>
                      </button>
                      {isAdmin && member.userId !== user.id && !isDeleted && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setConfirmDialog({ open: true, action: 'demote', data: member.userId })} 
                          className="text-xs shrink-0"
                          style={document.documentElement.classList.contains('discuss-black') ? { borderColor: '#4A4A68', color: '#C8C8E0', backgroundColor: '#1E1E28' } : {}}
                        >Demote</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {regularMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase mb-2">Members</p>
              <div className="space-y-2">
                {regularMembers.map(member => {
                  const details = userDetails[member.userId];
                  return (
                    <div key={member.userId} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]">
                      <button onClick={() => handleUserClick(member.userId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        {details?.photo_url ? <img referrerPolicy="no-referrer" src={details.photo_url} alt="" className="w-10 h-10 rounded-full shrink-0" /> : (
                          <div className="w-10 h-10 rounded-full bg-[#2563EB] discuss:bg-[#EF4444] flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">{details?.username?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] truncate">@{details?.username || 'User'}</span>
                            {details?.verified && <VerifiedBadge size="sm" />}
                          </div>
                        </div>
                      </button>
                      {isAdmin && !isDeleted && (
                        <div className="flex gap-1 shrink-0">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setConfirmDialog({ open: true, action: 'promote', data: member.userId })} 
                            className="text-xs px-2"
                            style={document.documentElement.classList.contains('discuss-black') ? { borderColor: 'rgba(255,0,127,0.3)', color: '#FF007F', backgroundColor: 'rgba(255,0,127,0.05)' } : {}}
                          >
                            <Shield className="w-3 h-3 mr-1" />Promote
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setConfirmDialog({ open: true, action: 'remove', data: member.userId })} 
                            className="text-xs text-red-600 px-2"
                            style={document.documentElement.classList.contains('discuss-black') ? { borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.05)' } : {}}
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

        <div className="space-y-2">
          {isMember && (
            <Button onClick={() => setConfirmDialog({ open: true, action: 'leave' })} variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50">
              <LogOut className="w-4 h-4 mr-2" />Leave Group
            </Button>
          )}
          
          {isAdmin && isMember && (
            <>
              <Button onClick={() => setConfirmDialog({ open: true, action: 'deletemessages' })} variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2" />Delete All Messages (For Everyone)
              </Button>
              <Button onClick={() => setConfirmDialog({ open: true, action: 'deletegroup' })} variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2" />Delete Group (Permanent)
              </Button>
            </>
          )}
          
          <Button onClick={() => setConfirmDialog({ open: true, action: 'deletechat' })} variant="outline" className="w-full border-neutral-200 text-neutral-600 hover:bg-neutral-50">
            <Trash2 className="w-4 h-4 mr-2" />Delete Chat From List
          </Button>
        </div>
      </div>

      <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>{groupInfo?.type === 'private' ? 'Add friends to group' : 'Add anyone to group'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search users..." className="pl-10" />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-center text-neutral-500 py-8">No users available</p>
              ) : (
                filteredUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-700 rounded-lg">
                    <div className="flex items-center gap-3">
                      {u.photo_url ? <img referrerPolicy="no-referrer" src={u.photo_url} alt="" className="w-10 h-10 rounded-full" /> : (
                        <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{u.username?.slice(0, 2).toUpperCase()}</span>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-sm">@{u.username}</span>
                          {u.verified && <VerifiedBadge size="sm" />}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleAddMember(u.id)} className="bg-[#2563EB] text-white text-xs">Add</Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, data: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'remove' && 'Remove Member?'}
              {confirmDialog.action === 'promote' && 'Promote to Admin?'}
              {confirmDialog.action === 'demote' && 'Demote Admin?'}
              {confirmDialog.action === 'leave' && 'Leave Group?'}
              {confirmDialog.action === 'deletemessages' && 'Delete All Messages?'}
              {confirmDialog.action === 'deletegroup' && 'Delete Group Permanently?'}
              {confirmDialog.action === 'deletechat' && 'Delete Chat From List?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'remove' && 'This member will be removed from the group.'}
              {confirmDialog.action === 'promote' && 'This member will be promoted to admin with full group management permissions.'}
              {confirmDialog.action === 'demote' && 'This admin will be demoted to a regular member.'}
              {confirmDialog.action === 'leave' && 'You will leave this group. You can rejoin if added back.'}
              {confirmDialog.action === 'deletemessages' && 'This will DELETE ALL MESSAGES for ALL members. The group will remain but show "No messages". This cannot be undone!'}
              {confirmDialog.action === 'deletegroup' && 'This will PERMANENTLY DELETE the group for ALL members. All messages and data will be lost. This cannot be undone!'}
              {confirmDialog.action === 'deletechat' && 'This will remove the chat from your list only. You can rejoin later if added back.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmDialog.action === 'remove') handleRemoveMember(confirmDialog.data);
              else if (confirmDialog.action === 'promote') handlePromote(confirmDialog.data);
              else if (confirmDialog.action === 'demote') handleDemote(confirmDialog.data);
              else if (confirmDialog.action === 'leave') handleLeaveGroup();
              else if (confirmDialog.action === 'deletemessages') handleDeleteAllMessages();
              else if (confirmDialog.action === 'deletegroup') handleDeleteGroup();
              else if (confirmDialog.action === 'deletechat') handleDeleteChat();
            }} className="bg-red-600 hover:bg-red-700">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
