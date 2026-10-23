import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  Sparkles,
  Cpu,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "./Skeleton";

export type ChipVariant =
  | "REAL"
  | "SYNTHETIC"
  | "ILLUSTRATIVE"
  | "MOCK"
  | "CLEAN"
  | "FRAUD"
  | "verified"
  | "flagged"
  | "warning"
  | "info"
  | "muted";

export interface ChipProps {
  variant?: ChipVariant;
  label?: string;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
}

interface VariantStyleConfig {
  defaultIcon: LucideIcon;
  defaultLabel: string;
  classes: string;
  iconClasses?: string;
}

const CHIP_CONFIG: Record<ChipVariant, VariantStyleConfig> = {
  REAL: {
    defaultIcon: Circle,
    defaultLabel: "REAL",
    classes:
      "border border-ink/80 text-ink bg-transparent font-mono tracking-wider font-bold shadow-none",
    iconClasses: "w-2.5 h-2.5 fill-current",
  },
  SYNTHETIC: {
    defaultIcon: Cpu,
    defaultLabel: "SYNTHETIC",
    classes:
      "border border-dashed border-muted-strong text-muted-strong bg-transparent font-mono tracking-wider font-semibold",
    iconClasses: "w-3 h-3",
  },
  ILLUSTRATIVE: {
    defaultIcon: Sparkles,
    defaultLabel: "ILLUSTRATIVE",
    classes:
      "border border-hairline bg-surface-soft text-muted-strong font-mono tracking-wider font-medium",
    iconClasses: "w-3 h-3 text-brand",
  },
  MOCK: {
    defaultIcon: Database,
    defaultLabel: "MOCK",
    classes:
      "bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-400 font-mono tracking-wider font-semibold",
    iconClasses: "w-3 h-3",
  },
  CLEAN: {
    defaultIcon: CheckCircle2,
    defaultLabel: "CLEAN",
    classes:
      "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400",
  },
  FRAUD: {
    defaultIcon: AlertTriangle,
    defaultLabel: "FRAUD",
    classes:
      "bg-[#FDECEC] text-[#9B1C1C] border border-[#FCA5A5] dark:bg-red-500/20 dark:text-[#FF6B6B] dark:border-red-500/30 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-[#9B1C1C] dark:text-[#FF6B6B]",
  },
  // Compatibility aliases with existing BadgeVariant
  verified: {
    defaultIcon: CheckCircle2,
    defaultLabel: "VERIFIED",
    classes:
      "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400",
  },
  flagged: {
    defaultIcon: AlertTriangle,
    defaultLabel: "FLAGGED",
    classes:
      "bg-[#FDECEC] text-[#9B1C1C] border border-[#FCA5A5] dark:bg-red-500/20 dark:text-[#FF6B6B] dark:border-red-500/30 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-[#9B1C1C] dark:text-[#FF6B6B]",
  },
  warning: {
    defaultIcon: AlertTriangle,
    defaultLabel: "WARNING",
    classes:
      "bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-400 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-amber-600 dark:text-amber-400",
  },
  info: {
    defaultIcon: Sparkles,
    defaultLabel: "INFO",
    classes:
      "bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 font-semibold",
    iconClasses: "w-3.5 h-3.5 text-blue-600 dark:text-blue-400",
  },
  muted: {
    defaultIcon: Circle,
    defaultLabel: "NEUTRAL",
    classes:
      "bg-surface-soft border border-hairline text-muted-strong font-medium",
    iconClasses: "w-3 h-3 text-muted",
  },
};

export const Chip: React.FC<ChipProps> = ({
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
    return <Skeleton className={`h-6 w-20 rounded-chip inline-block ${className}`} />;
  }

  if (error) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-chip text-xs font-semibold bg-[#FDECEC] border border-[#FCA5A5] text-[#9B1C1C] dark:bg-red-500/20 dark:text-[#FF6B6B] ${className}`}
        title={error}
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Error</span>
      </span>
    );
  }

  if (isEmpty && !label) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-chip text-xs font-medium bg-surface-soft border border-hairline text-muted-strong italic ${className}`}
      >
        <Circle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        <span>No status</span>
      </span>
    );
  }

  const cfg = CHIP_CONFIG[variant] || CHIP_CONFIG.muted;
  const Icon = CustomIcon || cfg.defaultIcon;
  const displayLabel = label ?? cfg.defaultLabel;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10.5px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  }[size];

  return (
    <span
      role="status"
      className={`inline-flex items-center rounded-chip leading-none select-none transition-colors ${cfg.classes} ${sizeClasses} ${className}`}
    >
      <Icon className={`${cfg.iconClasses || "w-3.5 h-3.5"} shrink-0`} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
};

export default Chip;
