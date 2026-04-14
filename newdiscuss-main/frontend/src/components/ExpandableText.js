import { useState, useRef, useEffect, useCallback } from 'react';

export default function ExpandableText({ text, maxLines = 5, children }) {
  const [expanded, setExpanded] = useState(false);
  const [needsTruncation, setNeedsTruncation] = useState(false);
  const measureRef = useRef(null);

  const measuredCallback = useCallback((node) => {
    measureRef.current = node;
    if (node) {
      // Use requestAnimationFrame to ensure styles are computed
      requestAnimationFrame(() => {
        const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 20;
        const maxHeight = lineHeight * maxLines;
        if (node.scrollHeight > maxHeight + 4) {
          setNeedsTruncation(true);
        } else {
          setNeedsTruncation(false);
        }
      });
    }
  }, [maxLines]);

  // Re-measure when text changes
  useEffect(() => {
    if (measureRef.current) {
      requestAnimationFrame(() => {
        if (!measureRef.current) return;
        const el = measureRef.current;
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
        const maxHeight = lineHeight * maxLines;
        if (el.scrollHeight > maxHeight + 4) {
          setNeedsTruncation(true);
        } else {
          setNeedsTruncation(false);
        }
      });
    }
  }, [text, maxLines]);

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(!expanded);
  };

  return (
    <div>
      <div
        ref={measuredCallback}
        style={(!expanded && needsTruncation) ? {
          display: '-webkit-box',
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } : {}}
      >
        {children || <span className="whitespace-pre-wrap">{text}</span>}
      </div>
      {needsTruncation && (
        <button
          data-testid="expand-toggle"
          onClick={handleToggle}
          className="text-[#2563EB] dark:text-[#60A5FA] discuss:text-[#EF4444] hover:text-[#1D4ED8] dark:hover:text-[#93C5FD] discuss:hover:text-[#DC2626] text-[13px] font-semibold mt-1 inline-block transition-colors"
        >
          {expanded ? 'Less' : 'More...'}
        </button>
      )}
    </div>
  );
}
