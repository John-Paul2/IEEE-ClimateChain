import React from "react";
import type { LucideIcon } from "lucide-react";

export type ButtonVariant = "black" | "red" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "black",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  isLoading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}) => {
  const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-2.5 text-base gap-2.5",
  };

  const variantClasses: Record<ButtonVariant, string> = {
    black:
      "bg-ink text-white hover:opacity-90 dark:bg-white dark:text-black dark:hover:bg-slate-100 shadow-sm border border-transparent active:scale-[0.99]",
    red:
      "bg-brand text-white hover:bg-brand-pressed active:scale-[0.99] shadow-sm border border-transparent",
    ghost:
      "bg-transparent text-ink hover:bg-surface-soft border border-transparent hover:border-hairline",
  };

  const iconSizes: Record<ButtonSize, string> = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  if (isLoading) {
    return (
      <button
        type={type}
        disabled
        className={`inline-flex items-center justify-center font-semibold rounded-pill cursor-not-allowed opacity-75 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      >
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
        <span>Loading...</span>
      </button>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold rounded-pill transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={`${iconSizes[size]} shrink-0`} aria-hidden="true" />}
      {children && <span>{children}</span>}
      {IconRight && <IconRight className={`${iconSizes[size]} shrink-0`} aria-hidden="true" />}
    </button>
  );
};

export default Button;
