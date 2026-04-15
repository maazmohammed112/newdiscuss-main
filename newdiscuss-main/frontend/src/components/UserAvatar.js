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

import { useState, useMemo } from 'react';

const AVATAR_COLORS = [
  'bg-blue-500 text-white',
  'bg-red-500 text-white',
  'bg-green-500 text-white',
  'bg-yellow-500 text-white',
  'bg-purple-500 text-white',
  'bg-pink-500 text-white',
  'bg-indigo-500 text-white',
  'bg-teal-500 text-white',
  'bg-orange-500 text-white',
  'bg-cyan-500 text-white'
];

/**
 * Generates initials from a username.
 * e.g., "mohammedmaaza" -> "M"
 * "john doe" -> "JD"
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  if (!cleanName) return name.charAt(0).toUpperCase();

  const parts = cleanName.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 1).toUpperCase();
}

/**
 * Predictably picks a color based on the username string.
 */
function getColorClass(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Formats Google/Firebase photo urls correctly
 */
function formatUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url === 'null' || url === 'undefined') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('lh3.googleusercontent')) return `https://${url}`;
  // Google requires the size parameter or it may return 404. We ensure it's a good size.
  if (url.includes('googleusercontent.com') && url.includes('=s')) {
    return url.replace(/=s\d+-?[a-zA-Z]*/, '=s192-c');
  }
  return url;
}

/**
 * @param {string}  src          — image URL (photo_url / photoURL)
 * @param {string}  username     — used to generate the letter fallback
 * @param {string}  [className]  — additional CSS classes (e.g. "w-9 h-9")
 * @param {string}  [alt]        — alt text (defaults to username)
 */
export default function UserAvatar({
  src,
  username = '?',
  className = 'w-9 h-9',
  alt,
  style = {},
}) {
  const [failed, setFailed] = useState(false);

  const altText = alt || username || 'User';
  const cleanSrc = formatUrl(src);

  const initials = useMemo(() => getInitials(username), [username]);
  const colorClass = useMemo(() => getColorClass(username), [username]);

  // Show letter fallback if: no src, or the image failed to load
  if (!cleanSrc || failed) {
    return (
      <div
        className={`${className} rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none ${colorClass}`}
        style={{ ...style, fontSize: 'clamp(0.75rem, 40%, 2rem)' }}
        aria-label={altText}
        role="img"
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={cleanSrc}
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
