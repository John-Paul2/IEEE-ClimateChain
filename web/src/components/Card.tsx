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
      className={`bg-surface border border-hairline rounded-card p-5 sm:p-6 shadow-card transition-colors ${className}`}
    >
      {(title || subtitle || Icon || actions) && (
        <header className="flex items-start justify-between gap-3 pb-3 sm:pb-4 mb-4 sm:mb-5 border-b border-hairline">
          <div className="flex items-center gap-3 min-w-0">
            {isLoading ? (
              <Skeleton className="w-10 h-10 rounded-xl" />
            ) : (
              Icon && (
                <div className="p-2 sm:p-2.5 rounded-xl bg-surface-soft border border-hairline text-ink shrink-0">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand" aria-hidden="true" />
                </div>
              )
            )}
            <div className="min-w-0">
              {isLoading ? (
                <>
                  <Skeleton className="h-5 w-36 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </>
              ) : (
                <>
                  {title && (
                    <h3 className="font-heading font-semibold text-lg sm:text-[20px] text-ink tracking-tight truncate">
                      {title}
                    </h3>
                  )}
                  {subtitle && <p className="text-[13px] text-muted-strong mt-0.5 truncate">{subtitle}</p>}
                </>
              )}
            </div>
          </div>
          {actions && !isLoading && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}

      {isLoading ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-3/4 rounded-xl" />
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

export default Card;
