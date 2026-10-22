import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Failed to load data",
  message = "An unexpected error occurred while fetching information.",
  error,
  onRetry,
  className = "",
}) => {
  const detail =
    error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-col items-center justify-center p-8 text-center bg-flagged/10 border border-flagged/30 rounded-xl ${className}`}
    >
      <div className="p-3 bg-flagged/20 border border-flagged/40 rounded-xl text-flagged mb-3">
        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="text-base font-semibold text-text">{title}</h4>
      <p className="mt-1 text-sm text-muted max-w-md">{message}</p>
      {detail && (
        <code className="mt-2 text-xs font-mono px-2 py-1 bg-surface-sunken/80 border border-border text-flagged rounded">
          {detail}
        </code>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-surface-raised hover:bg-border text-text border border-border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
        >
          <RefreshCw className="w-4 h-4 text-muted" aria-hidden="true" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
