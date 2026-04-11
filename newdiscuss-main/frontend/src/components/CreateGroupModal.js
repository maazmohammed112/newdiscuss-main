import { useState, useEffect } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  createGroup, 
  isGroupNameAvailable, 
  GROUP_TYPE 
} from '@/lib/groupsDb';
import { AlertCircle, Loader2, Check, X, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateGroupModal({ open, onOpenChange, userId, onGroupCreated }) {
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState(GROUP_TYPE.PUBLIC);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(null);
  const [error, setError] = useState('');

  // Real-time name availability check
  useEffect(() => {
    if (!groupName.trim() || groupName.trim().length < 3) {
      setIsAvailable(null);
      setChecking(false);
      return;
    }

    const checkTimer = setTimeout(async () => {
      setChecking(true);
      try {
        const available = await isGroupNameAvailable(groupName);
        setIsAvailable(available);
        setError('');
      } catch (err) {
        console.error('Error checking name:', err);
        setIsAvailable(false);
        setError(err.message || 'Failed to check availability');
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(checkTimer);
  }, [groupName]);

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    if (groupName.trim().length < 3) {
      setError('Group name must be at least 3 characters');
      return;
    }

    if (!isAvailable) {
      setError('This group name is already taken');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const group = await createGroup(userId, groupName, groupType);
      toast.success(`Group "${groupName}" created successfully!`);
      onGroupCreated?.(group);
      onOpenChange(false);
      
      // Reset form
      setGroupName('');
      setGroupType(GROUP_TYPE.PUBLIC);
      setIsAvailable(null);
    } catch (err) {
      console.error('Error creating group:', err);
      setError(err.message || 'Failed to create group');
      toast.error(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setGroupName('');
      setGroupType(GROUP_TYPE.PUBLIC);
      setIsAvailable(null);
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]">
        <DialogHeader>
          <DialogTitle className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] text-lg font-bold">
            Create New Group
          </DialogTitle>
          <DialogDescription className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]">
            Create a public or private group. Group names must be unique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-semibold">
              Group Name
            </Label>
            <div className="relative">
              <Input
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name (min 3 characters)"
                className="pr-10 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]"
                disabled={loading}
                maxLength={50}
              />
              {checking && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                </div>
              )}
              {!checking && isAvailable !== null && groupName.trim().length >= 3 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isAvailable ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <X className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {!checking && isAvailable === false && !error && groupName.trim().length >= 3 && (
              <p className="text-xs text-red-600 dark:text-red-500">
                This group name is already taken
              </p>
            )}
            {!checking && isAvailable === true && groupName.trim().length >= 3 && (
              <p className="text-xs text-green-600 dark:text-green-500">
                Group name is available!
              </p>
            )}
          </div>

          {/* Group Type */}
          <div className="space-y-2">
            <Label className="text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] font-semibold">
              Group Type
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGroupType(GROUP_TYPE.PUBLIC)}
                disabled={loading}
                className={`p-4 rounded-[12px] border-2 transition-all ${
                  groupType === GROUP_TYPE.PUBLIC
                    ? 'border-[#2563EB] discuss:border-[#EF4444] bg-[#2563EB]/5 discuss:bg-[#EF4444]/5'
                    : 'border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a]'
                } ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#2563EB] discuss:hover:border-[#EF4444]'}`}
              >
                <Users className={`w-6 h-6 mx-auto mb-2 ${
                  groupType === GROUP_TYPE.PUBLIC
                    ? 'text-[#2563EB] discuss:text-[#EF4444]'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`} />
                <p className={`font-semibold text-sm ${
                  groupType === GROUP_TYPE.PUBLIC
                    ? 'text-[#2563EB] discuss:text-[#EF4444]'
                    : 'text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]'
                }`}>
                  Public
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] mt-1">
                  Anyone can search and join
                </p>
              </button>

              <button
                onClick={() => setGroupType(GROUP_TYPE.PRIVATE)}
                disabled={loading}
                className={`p-4 rounded-[12px] border-2 transition-all ${
                  groupType === GROUP_TYPE.PRIVATE
                    ? 'border-[#2563EB] discuss:border-[#EF4444] bg-[#2563EB]/5 discuss:bg-[#EF4444]/5'
                    : 'border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a]'
                } ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#2563EB] discuss:hover:border-[#EF4444]'}`}
              >
                <Lock className={`w-6 h-6 mx-auto mb-2 ${
                  groupType === GROUP_TYPE.PRIVATE
                    ? 'text-[#2563EB] discuss:text-[#EF4444]'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`} />
                <p className={`font-semibold text-sm ${
                  groupType === GROUP_TYPE.PRIVATE
                    ? 'text-[#2563EB] discuss:text-[#EF4444]'
                    : 'text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]'
                }`}>
                  Private
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] mt-1">
                  Invite-only group
                </p>
              </button>
            </div>
          </div>

          {/* Warning */}
          <div
            className="bg-amber-50 dark:bg-amber-950/30 discuss:bg-amber-950/30 border border-amber-200 dark:border-amber-800 discuss:border-amber-800 rounded-[12px] p-3"
            style={document.documentElement.classList.contains('discuss-black')
              ? { backgroundColor: 'rgba(120,53,15,0.25)', borderColor: 'rgba(217,119,6,0.3)' }
              : {}}
          >
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 discuss:text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p
                  className="text-sm font-semibold text-amber-900 dark:text-amber-200 discuss:text-amber-200 mb-1"
                  style={document.documentElement.classList.contains('discuss-black') ? { color: '#FCD34D' } : {}}
                >
                  Important Notice
                </p>
                <p
                  className="text-xs text-amber-800 dark:text-amber-300 discuss:text-amber-300"
                  style={document.documentElement.classList.contains('discuss-black') ? { color: '#FDE68A' } : {}}
                >
                  Group type cannot be modified after creation. To change the type, you'll need to delete the group and create a new one.
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 discuss:bg-red-950/30 border border-red-200 dark:border-red-800 discuss:border-red-800 rounded-[12px] p-3">
              <p className="text-sm text-red-600 dark:text-red-400 discuss:text-red-400">
                {error}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !groupName.trim() || !isAvailable || groupName.trim().length < 3}
            className="bg-[#2563EB] discuss:bg-[#EF4444] hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Group'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
