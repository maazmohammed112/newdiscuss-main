/**
 * UserAvatar.js — Shared avatar image component
 *
 * Fixes the "profile pic broken on deployment, works on localhost" issue:
 *
 *  Root cause: Google profile photo service (lh3.googleusercontent.com) and
 *  Firebase Storage block image requests that include a Referer header pointing
 *  to an unknown/cross-origin domain. On localhost there's no Referer (or the
 *  browser sends none by default for file://) so it works. On production, the
 *  Netlify domain is sent as Referer and Google rejects it.
 *
 *  Fix: Set + on every
 *  profile image. This tells the browser to suppress the Referer and send a
 *  CORS pre-flight, which Google's CDN accepts.
 *
 *  Additional: Shows a graceful letter-avatar fallback if the image fails.
 */

import { useState } from 'react';
import { User } from 'lucide-react';

/**
 * @param {string}  src          — image URL (photo_url / photoURL)
 * @param {string}  username     — used to generate the letter fallback
 * @param {string}  [className]  — additional CSS classes (e.g. "w-9 h-9")
 * @param {string}  [alt]        — alt text (defaults to username)
 * @param {string}  [fallbackBg] — CSS background for the letter avatar
 */
export default function UserAvatar({
  src,
  username = '?',
  className = 'w-9 h-9',
  alt,
  fallbackBg = 'linear-gradient(135deg, #2563EB, #1d4ed8)',
  style = {},
}) {
  const [failed, setFailed] = useState(false);

  const altText = alt || username || 'User';

  // Show letter fallback if: no src, or the image failed to load
  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-full flex items-center justify-center text-[#6275AF] dark:text-[#94A3B8] discuss:text-[#9CA3AF] bg-[#F1F5F9] dark:bg-[#1E293B] discuss:bg-[#262626] border border-[#E2E8F0] dark:border-[#334155] discuss:border-[#333333] flex-shrink-0`}
        style={style}
        aria-label={altText}
        role="img"
      >
        <User className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={altText}
      className={`${className} rounded-full object-cover flex-shrink-0`}
      style={style}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  );
}
