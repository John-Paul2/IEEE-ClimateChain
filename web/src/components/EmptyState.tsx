import React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { Button } from "./Button";

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
      className={`flex flex-col items-center justify-center p-8 text-center bg-surface-soft/50 border border-hairline rounded-card ${className}`}
    >
      <div className="p-3 bg-canvas border border-hairline rounded-2xl text-muted-strong mb-3 shadow-sm">
        <Icon className="w-6 h-6 text-brand" aria-hidden="true" />
      </div>
      <h4 className="font-heading font-semibold text-base text-ink">{title}</h4>
      <p className="mt-1 text-[13px] text-muted-strong max-w-sm">{description}</p>
      {action && (
        <div className="mt-4">
          <Button variant="black" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
