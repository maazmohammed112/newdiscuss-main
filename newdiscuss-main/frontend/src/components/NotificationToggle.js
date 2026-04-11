// Notification Toggle Component for Profile Page
// Bell icon with ON/OFF toggle for push notifications

import { useState, useEffect } from 'react';
import {
  isPushSupported,
  isIOS,
  isPWAInstalled,
  getIOSVersion,
  canUsePush,
  getPermissionStatus,
  registerPushSubscription,
  unsubscribePush,
  isNotificationsEnabled
} from '@/lib/pushNotificationService';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Bell, BellOff, Loader2, AlertCircle, Smartphone, Info } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationToggle({ compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const { theme } = useTheme();
  const isBlack = theme === 'discuss-black';
  
  useEffect(() => {
    const checkStatus = async () => {
      try {
        setEnabled(isNotificationsEnabled());
      } catch (error) {
        console.error('Error checking notification status:', error);
      }
      setLoading(false);
    };
    checkStatus();
  }, []);
  
  const handleToggle = async () => {
    if (toggling) return;
    
    if (isIOS() && !isPWAInstalled()) {
      setShowIOSHelp(true);
      toast.error('Install the app first', {
        description: 'Add Discuss to your Home Screen to enable notifications'
      });
      return;
    }
    
    if (isIOS() && getIOSVersion() < 16.4) {
      toast.error('iOS 16.4+ required', {
        description: 'Update your iOS to enable push notifications'
      });
      return;
    }
    
    if (!isPushSupported()) {
      toast.error('Not supported', {
        description: 'Push notifications are not supported on this browser'
      });
      return;
    }
    
    setToggling(true);
    
    try {
      if (!enabled) {
        const subscription = await registerPushSubscription();
        if (subscription) {
          setEnabled(true);
          toast.success('Notifications enabled! 🔔');
        } else {
          const permission = getPermissionStatus();
          if (permission === 'denied') {
            toast.error('Permission denied', {
              description: 'Please enable notifications in your browser settings'
            });
          } else {
            toast.error('Could not enable notifications');
          }
        }
      } else {
        await unsubscribePush();
        setEnabled(false);
        toast.success('Notifications disabled');
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      toast.error('Something went wrong');
    }
    
    setToggling(false);
  };
  
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {!compact && <span className="text-sm">Loading...</span>}
      </div>
    );
  }
  
  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        disabled={toggling}
        className={`relative ${enabled ? 'text-primary' : 'text-muted-foreground'}`}
        title={enabled ? 'Notifications ON' : 'Notifications OFF'}
      >
        {toggling ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : enabled ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5" />
        )}
      </Button>
    );
  }

  // ── discuss-black inline styles ──
  const containerStyle = isBlack
    ? { backgroundColor: '#1A1A24', borderRadius: '8px', border: '1px solid rgba(255,0,127,0.15)' }
    : {};
  const titleStyle = isBlack ? { color: '#F0F0F8' } : {};
  const subStyle = isBlack ? { color: '#9090A8' } : {};
  const iconStyle = isBlack
    ? { color: enabled ? '#FF007F' : '#9090A8' }
    : {};

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50"
        style={containerStyle}
      >
        <div className="flex items-center gap-3">
          {enabled ? (
            <Bell className="h-5 w-5 text-primary" style={iconStyle} />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" style={iconStyle} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm" style={titleStyle}>Push Notifications</p>
              {/* Info Icon */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-primary transition-colors"
                    style={isBlack ? { color: '#9090A8' } : {}}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-sm" align="start">
                  <div className="space-y-2">
                    <p className="font-medium">About Notifications</p>
                    <ul className="text-muted-foreground text-xs space-y-1">
                      <li>• There may be slight delays in some notifications</li>
                      <li>• Some notifications may not work perfectly yet</li>
                      <li>• We are actively improving and optimizing the system</li>
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground" style={subStyle}>
              {enabled ? "You'll receive alerts for messages & updates" : 'Enable to get notified'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {toggling && <Loader2 className="h-4 w-4 animate-spin" style={isBlack ? { color: '#FF007F' } : {}} />}
          {/* Switch with forced discuss-black styling via CSS custom properties */}
          <div
            style={isBlack ? {
              '--switch-bg-off': '#2A2A38',
              '--switch-bg-on': '#FF007F',
            } : {}}
          >
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              style={isBlack
                ? {
                    backgroundColor: enabled ? '#FF007F' : '#2A2A38',
                    borderColor: enabled ? '#FF007F' : 'rgba(255,0,127,0.3)',
                  }
                : {}}
            />
          </div>
        </div>
      </div>
      
      {/* iOS Help */}
      {showIOSHelp && isIOS() && !isPWAInstalled() && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Smartphone className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">Install the app first</p>
            <p className="text-muted-foreground text-xs mt-1" style={isBlack ? { color: '#9090A8' } : {}}>
              Tap the share button <span className="inline-block px-1">⬆️</span> then "Add to Home Screen" to enable notifications on iOS.
            </p>
          </div>
        </div>
      )}
      
      {/* Permission denied help */}
      {getPermissionStatus() === 'denied' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-600 dark:text-red-400">Permission blocked</p>
            <p className="text-muted-foreground text-xs mt-1" style={isBlack ? { color: '#9090A8' } : {}}>
              Notifications are blocked. Please enable them in your browser/device settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
