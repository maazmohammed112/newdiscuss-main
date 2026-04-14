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
 *  Fix: Set referrerPolicy="no-referrer" + crossOrigin="anonymous" on every
 *  profile image. This tells the browser to suppress the Referer and send a
 *  CORS pre-flight, which Google's CDN accepts.
 *
 *  Additional: Shows a graceful letter-avatar fallback if the image fails.
 */

import { useState } from 'react';

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

  const letter = (username?.[0] || '?').toUpperCase();
  const altText = alt || username || 'User';

  // Show letter fallback if: no src, or the image failed to load
  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-full flex items-center justify-center text-white font-bold select-none flex-shrink-0`}
        style={{ background: fallbackBg, ...style }}
        aria-label={altText}
        role="img"
      >
        <span style={{ fontSize: 'calc(0.4 * min(100%, 100%))' }}>
          {letter}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={altText}
      className={`${className} rounded-full object-cover flex-shrink-0`}
      style={style}
      // ── The two attributes that fix the production CDN rejection ────────
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      // ────────────────────────────────────────────────────────────────────
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  );
}
