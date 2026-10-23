import React, { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";

export interface PopoverProps {
  title?: string;
  bullets?: string[];
  children?: React.ReactNode;
  triggerLabel?: string;
  className?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  title = "How to read this",
  bullets = [],
  children,
  triggerLabel = "Help and guidance",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger '?' Button */}
      <button
        type="button"
        data-testid="help-popover-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        title={title}
        className="w-7 h-7 rounded-full bg-surface-soft hover:bg-hairline border border-hairline text-muted-strong hover:text-ink flex items-center justify-center font-bold text-xs shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span aria-hidden="true" className="font-heading text-xs font-bold leading-none">?</span>
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div
          role="dialog"
          data-testid="help-popover-dialog"
          aria-label={title}
          className="absolute right-0 top-9 w-72 sm:w-80 p-4 bg-surface border border-hairline rounded-2xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-hairline">
            <div className="flex items-center gap-1.5 text-ink font-heading font-semibold text-sm">
              <HelpCircle className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close help popover"
              className="p-1 rounded-pill hover:bg-surface-soft text-muted hover:text-ink transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {bullets.length > 0 && (
            <ul className="space-y-2 text-xs text-muted-strong">
              {bullets.slice(0, 4).map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          {children && <div className="mt-2 text-xs text-muted-strong">{children}</div>}
        </div>
      )}
    </div>
  );
};

export default Popover;
