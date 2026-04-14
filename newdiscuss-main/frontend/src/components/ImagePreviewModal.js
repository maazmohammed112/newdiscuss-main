import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

export default function ImagePreviewModal({ open, onClose, imageUrl, altText = 'Profile picture' }) {
  if (!imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent 
        hideClose={true}
        className="sm:max-w-md bg-transparent border-0 shadow-none p-0 overflow-visible"
      >
        <div className="relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white dark:bg-[#1E293B] discuss:bg-[#262626] rounded-full shadow-lg flex items-center justify-center text-[#6275AF] hover:text-[#0F172A] dark:hover:text-white discuss:hover:text-[#F5F5F5] transition-colors border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          
          {/* Image */}
          <img referrerPolicy="no-referrer" src={imageUrl} 
            alt={altText}
            className="w-full h-auto max-h-[70vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
