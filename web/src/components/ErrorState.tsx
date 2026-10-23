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
      className={`flex flex-col items-center justify-center p-8 text-center bg-[#FDECEC] border border-[#FCA5A5] dark:bg-red-500/10 dark:border-red-500/30 rounded-card shadow-sm ${className}`}
    >
      <div className="p-3 bg-white dark:bg-red-500/20 border border-[#FCA5A5] dark:border-red-500/40 rounded-2xl text-brand mb-3 shadow-sm">
        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="font-heading font-semibold text-base text-ink">{title}</h4>
      <p className="mt-1 text-[13px] text-muted-strong max-w-md">{message}</p>
      {detail && (
        <code className="mt-2 text-xs font-mono px-3 py-1.5 bg-white dark:bg-black/40 border border-hairline text-brand rounded-chip">
          {detail}
        </code>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-pill bg-ink text-white hover:opacity-90 dark:bg-white dark:text-black transition-all shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
