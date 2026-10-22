import React from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { AlertCircle } from "lucide-react";

export interface StatTileProps {
  label: string;
  value?: string | number | null;
  unit?: string;
  icon?: LucideIcon;
  variant?: "default" | "verified" | "flagged" | "warning" | "info";
  delta?: {
    value: string;
    isPositive?: boolean;
  };
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
  icon: Icon,
  variant = "default",
  delta,
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  if (isLoading) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-32 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title={label} message={error} onRetry={onRetry} />
      </div>
    );
  }

  const valueColors = {
    default: "text-text",
    verified: "text-verified",
    flagged: "text-flagged",
    warning: "text-warning",
    info: "text-info",
  };

  const isValEmpty = isEmpty || value === null || value === undefined || value === "";

  return (
    <div
      role="region"
      aria-label={`${label} metric`}
      className={`p-4 bg-surface border border-border rounded-xl flex flex-col justify-between shadow-sm transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="p-1.5 rounded-lg bg-surface-raised border border-border text-muted">
            <Icon className="w-4 h-4 text-info" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        {isValEmpty ? (
          <span className="text-lg font-mono text-muted italic flex items-center gap-1">
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>needs source</span>
          </span>
        ) : (
          <>
            <span className={`text-2xl font-bold font-mono tracking-tight ${valueColors[variant]}`}>
              {value}
            </span>
            {unit && <span className="text-xs font-medium text-muted font-mono">{unit}</span>}
          </>
        )}
      </div>

      {delta && !isValEmpty && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span
            className={`font-semibold ${
              delta.isPositive ? "text-verified" : "text-flagged"
            }`}
          >
            {delta.value}
          </span>
          <span className="text-muted">vs previous</span>
        </div>
      )}
    </div>
  );
};
