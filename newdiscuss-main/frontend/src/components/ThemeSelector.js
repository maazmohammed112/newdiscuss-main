import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
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
import { Sun, Moon, Code, Zap } from 'lucide-react';

export default function ThemeSelector() {
  const { theme, changeTheme } = useTheme();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingTheme, setPendingTheme] = useState(null);

  const handleThemeChange = (newTheme) => {
    // Show confirmation for specialty themes when switching TO them
    if (
      (newTheme === 'discuss-light' && theme !== 'discuss-light') ||
      (newTheme === 'discuss-black' && theme !== 'discuss-black')
    ) {
      setPendingTheme(newTheme);
      setShowConfirm(true);
    } else {
      changeTheme(newTheme);
    }
  };

  const confirmThemeChange = () => {
    if (pendingTheme) {
      changeTheme(pendingTheme);
    }
    setShowConfirm(false);
    setPendingTheme(null);
  };

  const isDiscussTheme = theme === 'discuss-light';
  const isBlackTheme = theme === 'discuss-black';

  const themes = [
    { id: 'light',         name: 'Light',   icon: Sun  },
    { id: 'dark',          name: 'Dark',    icon: Moon },
    { id: 'discuss-light', name: 'Discuss', icon: Code },
    { id: 'discuss-black', name: 'Black',   icon: Zap  },
  ];

  const getActiveStyle = (id) => {
    if (theme !== id) return 'border-[#E2E6ED] text-[#6B7280] hover:border-[#1D7AFF]';
    if (id === 'discuss-light') return 'border-[#EF4444] bg-[#EF4444] text-white';
    if (id === 'discuss-black') return 'border-[#FF007F] bg-gradient-to-r from-[#FF007F] to-[#7000FF] text-white shadow-[0_0_12px_rgba(255,0,127,0.4)]';
    return 'border-[#1D7AFF] bg-[#1D7AFF] text-white';
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {themes.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              data-testid={`theme-option-${t.id}`}
              onClick={() => handleThemeChange(t.id)}
              className={`relative flex items-center justify-center gap-1.5 px-3 py-2 border transition-all text-xs font-medium rounded-md ${getActiveStyle(t.id)}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{t.name}</span>
              {/* Pink dot indicator for Black theme */}
              {t.id === 'discuss-black' && theme !== 'discuss-black' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF007F]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Confirmation dialog — shared for discuss-light and discuss-black */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingTheme === 'discuss-black' ? (
                <>
                  <Zap className="w-5 h-5 text-[#FF007F]" />
                  <span
                    style={{
                      background: 'linear-gradient(90deg, #FF007F, #7000FF)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Switch to Discuss Black?
                  </span>
                </>
              ) : (
                <>
                  <Code className="w-5 h-5 text-[#EF4444]" />
                  Switch to Discuss Theme?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTheme === 'discuss-black'
                ? 'This will change the app appearance (colors, fonts, UI style) to the Discuss Black theme — a futuristic dark UI with hot-pink, orange, and purple accents. Do you want to continue?'
                : 'This will apply a tech-inspired theme with monospace fonts, red accents, and square edges. You can switch back anytime from your profile settings.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { setShowConfirm(false); setPendingTheme(null); }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmThemeChange}
              style={
                pendingTheme === 'discuss-black'
                  ? { background: 'linear-gradient(135deg, #FF007F, #7000FF)', border: 'none' }
                  : {}
              }
              className={
                pendingTheme === 'discuss-black'
                  ? 'text-white font-medium'
                  : 'bg-[#EF4444] text-white hover:bg-[#DC2626] font-medium'
              }
            >
              {pendingTheme === 'discuss-black' ? 'Apply Black Theme' : 'Apply Discuss Theme'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
