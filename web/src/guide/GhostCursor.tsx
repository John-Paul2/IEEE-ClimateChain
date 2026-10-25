import React from "react";

export interface GhostCursorProps {
  x: number;
  y: number;
  visible: boolean;
  isRippling: boolean;
}

export const GhostCursor: React.FC<GhostCursorProps> = ({
  x,
  y,
  visible,
  isRippling,
}) => {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 z-50 pointer-events-none select-none transition-opacity duration-200"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        transition: prefersReducedMotion
          ? "none"
          : "transform 750ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Ripple effect on click */}
      {isRippling && !prefersReducedMotion && (
        <span className="absolute -left-4 -top-4 w-9 h-9 rounded-full border-2 border-brand bg-brand/20 animate-ping pointer-events-none" />
      )}

      {/* SVG Pointer Cursor */}
      <div className="relative">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="drop-shadow-md text-ink dark:text-white"
        >
          <path
            d="M 2 2 L 9.5 21.5 L 13 13 L 21.5 9.5 Z"
            fill="var(--brand, #E5383B)"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        <span className="absolute left-5 top-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-brand text-white shadow-sm whitespace-nowrap">
          Ghost
        </span>
      </div>
    </div>
  );
};
