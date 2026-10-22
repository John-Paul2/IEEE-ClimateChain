import React from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  contentClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "No items to display.",
  error = null,
  onRetry,
  className = "",
  contentClassName = "",
}) => {
  return (
    <section
      className={`bg-surface border border-border rounded-xl p-5 shadow-sm transition-colors ${className}`}
    >
      {(title || subtitle || Icon || actions) && (
        <header className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="w-9 h-9 rounded-lg" />
            ) : (
              Icon && (
                <div className="p-2 rounded-lg bg-surface-raised border border-border text-text">
                  <Icon className="w-5 h-5 text-info" aria-hidden="true" />
                </div>
              )
            )}
            <div>
              {isLoading ? (
                <>
                  <Skeleton className="h-5 w-40 mb-1" />
                  <Skeleton className="h-3 w-60" />
                </>
              ) : (
                <>
                  {title && <h3 className="text-base font-semibold text-text tracking-tight">{title}</h3>}
                  {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
                </>
              )}
            </div>
          </div>
          {actions && !isLoading && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}

      {isLoading ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : isEmpty ? (
        <EmptyState description={emptyMessage} />
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </section>
  );
};
