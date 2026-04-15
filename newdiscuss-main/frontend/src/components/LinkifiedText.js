import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ExternalLink, AlertTriangle } from 'lucide-react';

// URL regex pattern - catches http/https, www, and bare domains with paths/extensions (like lnkd.in/...)
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;

/**
 * Truncate a URL to show abbreviated version
 * e.g., "https://example.com/very/long/path/to/something" -> "example.com/..."
 */
const truncateUrl = (url) => {
  try {
    // Add protocol if starts with www.
    const fullUrl = url.startsWith('www.') ? `https://${url}` : url;
    const urlObj = new URL(fullUrl);
    
    // Get hostname without www.
    let hostname = urlObj.hostname.replace(/^www\./, '');
    
    // If there's a path beyond just "/", show abbreviated version
    if (urlObj.pathname && urlObj.pathname !== '/') {
      // Show first part of path if it's long
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        const firstPart = pathParts[0];
        if (pathParts.length > 1 || firstPart.length > 15) {
          return `${hostname}/${firstPart.substring(0, 10)}...`;
        }
        return `${hostname}/${firstPart}`;
      }
    }
    
    return hostname;
  } catch {
    // If URL parsing fails, return truncated version of original
    if (url.length > 40) {
      return url.substring(0, 35) + '...';
    }
    return url;
  }
};

/**
 * Parse text and return array of text segments and links
 */
export const parseTextWithLinks = (text) => {
  if (!text) return [];
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  const regex = new RegExp(URL_REGEX);
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    
    // Add the URL
    let url = match[0];
    // Add https:// if it doesn't have an http prefix
    const href = url.startsWith('http') ? url : `https://${url}`;
    // Store both full URL and truncated display version
    parts.push({ 
      type: 'link', 
      content: url, // Original URL for dialog
      displayContent: truncateUrl(url), // Abbreviated for display
      href 
    });
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

/**
 * Component to render text with clickable links and external redirect warning
 * URLs are displayed as abbreviated versions in posts, full URL shown in warning dialog
 */
export default function LinkifiedText({ text, className = '' }) {
  const [pendingUrl, setPendingUrl] = useState(null);
  const [fullUrlForDialog, setFullUrlForDialog] = useState('');
  
  const parts = parseTextWithLinks(text);
  
  const handleLinkClick = (e, href, fullUrl) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent click from bubbling to parent (post card)
    setPendingUrl(href);
    setFullUrlForDialog(fullUrl);
  };
  
  const handleConfirmRedirect = () => {
    if (pendingUrl) {
      window.open(pendingUrl, '_blank', 'noopener,noreferrer');
    }
    setPendingUrl(null);
    setFullUrlForDialog('');
  };
  
  return (
    <>
      <span className={className}>
        {parts.map((part, index) => {
          if (part.type === 'link') {
            return (
              <a
                key={index}
                href={part.href}
                onClick={(e) => handleLinkClick(e, part.href, part.content)}
                className="text-[#2563EB] dark:text-[#60A5FA] discuss:!text-[#EF4444] discuss-black:!text-[#EF4444] font-medium hover:underline inline-flex items-center gap-0.5 transition-colors group"
                title={part.content} // Show full URL on hover
              >
                <span className="group-hover:bg-[#EF4444]/10 discuss-black:group-hover:bg-[#EF4444]/20 rounded px-0.5">{part.displayContent}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            );
          }
          return <span key={index}>{part.content}</span>;
        })}
      </span>

      {/* External Redirect Warning Dialog - Shows FULL URL */}
      <AlertDialog open={!!pendingUrl} onOpenChange={(v) => { if (!v) { setPendingUrl(null); setFullUrlForDialog(''); } }}>
        <AlertDialogContent className="dark:bg-[#1E293B] dark:border-[#334155] discuss:bg-[#262626] discuss:border-[#333333]">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-[#F1F5F9] discuss:text-[#F5F5F5] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
              External Link
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-[#94A3B8] discuss:text-[#9CA3AF]">
              You are about to leave Discuss and visit an external website:
              <span className="block mt-2 p-2 bg-[#F5F5F7] dark:bg-[#0F172A] discuss:bg-[#1a1a1a] rounded text-[#0F172A] dark:text-[#F1F5F9] discuss:text-[#F5F5F5] text-xs font-mono break-all">
                {fullUrlForDialog || pendingUrl}
              </span>
              <span className="block mt-2 text-xs">
                We are not responsible for the content of external sites. Proceed with caution.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#F1F5F9] dark:border-[#334155] discuss:bg-[#333333] discuss:text-[#F5F5F5] discuss:border-[#333333]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRedirect} className="bg-[#2563EB] discuss:bg-[#EF4444] text-white hover:bg-[#1D4ED8] discuss:hover:bg-[#DC2626]">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
