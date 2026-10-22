import React from "react";
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, Circle, type LucideIcon } from "lucide-react";
import { Skeleton } from "./Skeleton";

export type BadgeVariant = "verified" | "flagged" | "warning" | "info" | "muted";

export interface BadgeProps {
  variant?: BadgeVariant;
  label?: string;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
}

const VARIANT_CONFIG: Record<
  BadgeVariant,
  { defaultIcon: LucideIcon; bg: string; border: string; text: string; roleDescription: string }
> = {
  verified: {
    defaultIcon: CheckCircle2,
    bg: "bg-verified/10",
    border: "border-verified/30",
    text: "text-verified",
    roleDescription: "Verified status",
  },
  flagged: {
    defaultIcon: AlertOctagon,
    bg: "bg-flagged/10",
    border: "border-flagged/30",
    text: "text-flagged",
    roleDescription: "Flagged status",
  },
  warning: {
    defaultIcon: AlertTriangle,
    bg: "bg-warning/10",
    border: "border-warning/30",
    text: "text-warning",
    roleDescription: "Warning status",
  },
  info: {
    defaultIcon: Info,
    bg: "bg-info/10",
    border: "border-info/30",
    text: "text-info",
    roleDescription: "Informational status",
  },
  muted: {
    defaultIcon: Circle,
    bg: "bg-surface-raised",
    border: "border-border",
    text: "text-muted",
    roleDescription: "Neutral status",
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "muted",
  label,
  icon: CustomIcon,
  size = "md",
  className = "",
  isLoading = false,
  isEmpty = false,
  error = null,
}) => {
  if (isLoading) {
    return <Skeleton className={`h-6 w-20 rounded-full inline-block ${className}`} />;
  }

  if (error) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-flagged/10 border border-flagged/30 text-flagged ${className}`}
        title={error}
      >
        <AlertOctagon className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Error</span>
      </span>
    );
  }

  if (isEmpty || !label) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-raised border border-border text-muted italic ${className}`}
      >
        <Circle className="w-3 h-3" aria-hidden="true" />
        <span>No status</span>
      </span>
    );
  }

  const cfg = VARIANT_CONFIG[variant];
  const Icon = CustomIcon || cfg.defaultIcon;

  const sizeStyles = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
    lg: "text-sm px-3 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <span
      role="status"
      aria-label={`${cfg.roleDescription}: ${label}`}
      className={`inline-flex items-center font-medium rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text} ${sizeStyles[size]} ${className}`}
    >
      <Icon className={`${iconSizes[size]} flex-shrink-0`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
