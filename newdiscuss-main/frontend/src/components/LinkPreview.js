/**
 * LinkPreview.js — Compact OG/meta preview card for URLs found in post content.
 *
 * • Fetches metadata via microlink.io (free public API, no key needed)
 * • Results cached in sessionStorage per URL to avoid redundant requests
 * • Gracefully hides itself on any error (fetch fail, timeout, no data)
 * • Constrained height so it fits cleanly inside any post card
 * • Respects all themes: light / dark / discuss-black
 */

import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Globe } from 'lucide-react';

const SESSION_KEY_PREFIX = 'lp_';
const FETCH_TIMEOUT_MS   = 5000;
const CACHE_MAX_AGE_MS   = 60 * 60 * 1000; // 1 hour per session

// --- Session cache helpers -------------------------------------------------

const readCache = (url) => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + url);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_MAX_AGE_MS) return null;
    return data; // null means "no data / failed" — intentionally cached
  } catch {
    return undefined; // undefined = not in cache at all
  }
};

const writeCache = (url, data) => {
  try {
    sessionStorage.setItem(SESSION_KEY_PREFIX + url, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full — ignore */ }
};

// --- Favicon helper ---------------------------------------------------------

const getFavicon = (pageUrl, fallbackDomain) => {
  try {
    const domain = fallbackDomain || new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
};

// --- Skeleton ---------------------------------------------------------------

function PreviewSkeleton() {
  return (
    <div className="flex gap-3 items-start animate-pulse">
      <div className="w-8 h-8 rounded bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] w-3/4" />
        <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] w-full" />
        <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-700 discuss:bg-[#333333] w-1/2" />
      </div>
    </div>
  );
}

// --- Main component ---------------------------------------------------------

/**
 * @param {string}   url        — the URL to preview
 * @param {Function} onClick    — optional: called when the card is clicked
 *                                (default: open in new tab with warning)
 */
export default function LinkPreview({ url, onClick }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [meta, setMeta]   = useState(null);
  const abortRef          = useRef(null);

  useEffect(() => {
    if (!url) return;

    // Check session cache first
    const cached = readCache(url);
    if (cached === null) {
      // Explicitly cached as "no data" — hide
      setState('error');
      return;
    }
    if (cached) {
      setMeta(cached);
      setState('done');
      return;
    }

    // Fresh fetch
    setState('loading');
    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&palette=false&adblock=false&screenshot=false`;

    fetch(apiUrl, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Non-OK response')))
      .then(json => {
        clearTimeout(timeout);
        if (json?.status !== 'success' || !json?.data) {
          writeCache(url, null);
          setState('error');
          return;
        }
        const { title, description, url: finalUrl, publisher, image } = json.data;
        if (!title && !description) {
          writeCache(url, null);
          setState('error');
          return;
        }
        const result = {
          title:       title       || '',
          description: description || '',
          domain:      publisher   || (() => { try { return new URL(finalUrl || url).hostname.replace('www.', ''); } catch { return ''; } })(),
          imageUrl:    image?.url  || null,
        };
        writeCache(url, result);
        setMeta(result);
        setState('done');
      })
      .catch(() => {
        clearTimeout(timeout);
        writeCache(url, null);
        setState('error');
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [url]);

  // Don't render anything on error or idle
  if (state === 'error' || state === 'idle') return null;

  const handleCardClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="mt-3 rounded-[10px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] bg-neutral-50 dark:bg-neutral-800/60 discuss:bg-[#111111] overflow-hidden cursor-pointer hover:border-[#2563EB]/40 dark:hover:border-[#60A5FA]/30 discuss:hover:border-[#EF4444]/30 transition-all duration-200 group"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick(e)}
      aria-label={meta?.title || 'External link preview'}
    >
      {state === 'loading' && (
        <div className="p-3">
          <PreviewSkeleton />
        </div>
      )}

      {state === 'done' && meta && (
        <div className="flex gap-0 overflow-hidden">
          {/* Left accent bar */}
          <div className="w-1 bg-[#2563EB] dark:bg-[#60A5FA] discuss:bg-[#EF4444] shrink-0" />

          <div className="flex-1 p-3 min-w-0">
            {/* Top row: favicon + domain */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <img
                src={getFavicon(url, meta.domain)}
                alt=""
                className="w-4 h-4 rounded shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
                loading="lazy"
              />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] font-medium truncate flex items-center gap-1">
                <Globe className="w-3 h-3 shrink-0" />
                {meta.domain}
              </span>
              <ExternalLink className="w-3 h-3 text-neutral-400 dark:text-neutral-500 discuss:text-[#6B7280] ml-auto shrink-0 group-hover:text-[#2563EB] dark:group-hover:text-[#60A5FA] discuss:group-hover:text-[#EF4444] transition-colors" />
            </div>

            {/* Title */}
            {meta.title && (
              <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] leading-snug line-clamp-1 group-hover:text-[#2563EB] dark:group-hover:text-[#60A5FA] discuss:group-hover:text-[#EF4444] transition-colors">
                {meta.title}
              </p>
            )}

            {/* Description */}
            {meta.description && (
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] leading-relaxed mt-0.5 line-clamp-2">
                {meta.description}
              </p>
            )}
          </div>

          {/* Thumbnail — only if image is available */}
          {meta.imageUrl && (
            <img
              src={meta.imageUrl}
              alt=""
              className="w-20 h-full object-cover shrink-0 hidden sm:block"
              style={{ maxHeight: '90px' }}
              onError={(e) => { e.target.style.display = 'none'; }}
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  );
}
