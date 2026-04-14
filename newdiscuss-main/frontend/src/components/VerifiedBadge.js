import { useState } from 'react';

// ─── Inline SVG verified badge ────────────────────────────────────────────────
// Replaces the third-party CDN img tag that was blocked by CSP in production.
// Pure SVG — no external network requests, works everywhere.
function VerifiedSVG({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Verified"
    >
      {/* Shield / badge background */}
      <path
        d="M12 2L3 6.5V12C3 16.75 6.88 21.2 12 22.5C17.12 21.2 21 16.75 21 12V6.5L12 2Z"
        fill="url(#vbg)"
      />
      {/* Checkmark */}
      <path
        d="M9 12L11 14L15 10"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="vbg" x1="3" y1="2" x2="21" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10B981" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function VerifiedBadge({ size = 'sm', className = '' }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const sizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setShowTooltip((v) => !v)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className="focus:outline-none inline-flex"
        aria-label="Verified User"
        title="Verified User"
      >
        <VerifiedSVG className={`${sizes[size]} inline-block cursor-pointer ${className}`} />
      </button>

      {showTooltip && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1.5 bg-[#0F172A] dark:bg-[#F1F5F9] text-white dark:text-[#0F172A] text-xs font-medium rounded-lg whitespace-nowrap z-50 shadow-lg pointer-events-none">
          Verified User
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#0F172A] dark:border-b-[#F1F5F9]" />
        </div>
      )}
    </div>
  );
}
