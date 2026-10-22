import React from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No data available",
  description = "There are no records to display at this time.",
  icon: Icon = Inbox,
  action,
  className = "",
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      className={`flex flex-col items-center justify-center p-8 text-center bg-surface-sunken/40 border border-border/40 rounded-xl ${className}`}
    >
      <div className="p-3 bg-surface-raised border border-border rounded-xl text-muted mb-3">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="text-base font-medium text-text">{title}</h4>
      <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-surface-raised hover:bg-border text-text border border-border transition-colors focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
