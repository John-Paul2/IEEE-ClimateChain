import React, { useState, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { AlertCircle } from "lucide-react";

export interface StatTileProps {
  label: string;
  value?: string | number | null;
  unit?: string;
  subtext?: string;
  icon?: LucideIcon;
  variant?: "default" | "verified" | "flagged" | "warning" | "info";
  delta?: {
    value: string;
    isPositive?: boolean;
  };
  onBand?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  subtext,
  icon: Icon,
  variant = "default",
  delta,
  onBand = false,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [displayNum, setDisplayNum] = useState<number | null>(
    typeof value === "number" ? value : null
  );
  const prevValueRef = useRef<number | null>(
    typeof value === "number" ? value : null
  );

  useEffect(() => {
    if (typeof value !== "number") {
      setDisplayNum(null);
      return;
    }
    if (prefersReducedMotion || prevValueRef.current === null) {
      setDisplayNum(value);
      prevValueRef.current = value;
      return;
    }

    const start = prevValueRef.current;
    const end = value;
    if (start === end) return;

    const startTime = performance.now();
    const duration = 200; // 200ms per Requirement 7

    let frameId: number;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const current = Math.round(start + (end - start) * progress);
      setDisplayNum(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = end;
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value, prefersReducedMotion]);
  if (isLoading) {
    return (
      <div
        className={`p-4 sm:p-5 rounded-card ${
          onBand ? "bg-transparent border-none" : "bg-surface border border-hairline shadow-card"
        } ${className}`}
      >
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-28 mb-1.5 rounded-md" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 sm:p-5 rounded-card ${
          onBand ? "bg-transparent border-none" : "bg-surface border border-hairline shadow-card"
        } ${className}`}
      >
        <ErrorState title={label} message={error} onRetry={onRetry} />
      </div>
    );
  }

  const valueColors = {
    default: "text-ink",
    verified: "text-emerald-600 dark:text-emerald-400",
    flagged: "text-brand",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  const isValEmpty = isEmpty || value === null || value === undefined || value === "";

  return (
    <div
      role="region"
      aria-label={`${label} metric`}
      className={`p-4 sm:p-5 rounded-card flex flex-col justify-between transition-all ${
        onBand
          ? "bg-transparent border-none shadow-none"
          : "bg-surface border border-hairline shadow-card hover:border-hairline-strong"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-strong tracking-normal">
          {label}
        </span>
        {Icon && (
          <div className="p-2 rounded-xl bg-surface-soft border border-hairline text-muted-strong shrink-0">
            <Icon className="w-4 h-4 text-brand" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {isValEmpty ? (
          <span className="text-[15px] font-mono text-muted-strong italic flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-warning" aria-hidden="true" />
            <span>needs source</span>
          </span>
        ) : (
          <>
            <span
              className={`font-heading text-[28px] font-bold tracking-tight leading-none ${valueColors[variant]}`}
            >
              {typeof value === "number" ? displayNum : value}
            </span>
            {unit && <span className="text-[13px] font-medium text-muted font-mono">{unit}</span>}
          </>
        )}
      </div>

      {subtext && !isValEmpty && (
        <div className="mt-1 text-xs font-mono text-muted-strong font-medium">
          {subtext}
        </div>
      )}

      {delta && !isValEmpty && (
        <div className="mt-2 text-xs font-mono font-medium flex items-center gap-1">
          <span className={delta.isPositive ? "text-emerald-600" : "text-brand"}>
            {delta.isPositive ? "▲" : "▼"} {delta.value}
          </span>
          <span className="text-muted text-[11px]">vs baseline</span>
        </div>
      )}
    </div>
  );
};

export default StatTile;
