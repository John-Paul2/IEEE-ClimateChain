import React, { useEffect, useState, useRef } from "react";
import { ArrowDownRight, Info } from "lucide-react";

export interface AnimatedSavingsProps {
  savingsEur: number;
  costWithDefaultEur: number;
  costWithVerifiedEur: number;
  priceQuarter?: string;
  certificatePrice?: number;
  defaultMarkup?: number;
  freeAllocationFactor?: number;
  className?: string;
}

export const AnimatedSavings: React.FC<AnimatedSavingsProps> = ({
  savingsEur,
  costWithDefaultEur,
  costWithVerifiedEur,
  priceQuarter = "2026-Q3",
  certificatePrice = 82.32,
  defaultMarkup = 0.10,
  freeAllocationFactor = 0.975,
  className = "",
}) => {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const prevValueRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplayValue(savingsEur);
      prevValueRef.current = savingsEur;
      return;
    }

    const startValue = prevValueRef.current;
    const targetValue = savingsEur;
    const duration = 1200; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out expo: 1 - 2^(-10 * progress)
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startValue + (targetValue - startValue) * ease;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = targetValue;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [savingsEur]);

  const percentage =
    costWithDefaultEur > 0
      ? Math.max(0, ((savingsEur / costWithDefaultEur) * 100)).toFixed(1)
      : "0.0";

  return (
    <div
      role="region"
      aria-label="CBAM Net Importer Savings Summary"
      className={`p-6 bg-gradient-to-br from-surface-raised to-surface border border-verified/30 rounded-2xl shadow-lg relative overflow-hidden ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-verified flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-verified" aria-hidden="true" />
              Net CBAM Importer Savings
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-verified/10 text-verified border border-verified/30">
              {percentage}% Cost Reduction
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <span
              className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-text"
              data-testid="animated-savings-value"
            >
              €
              {displayValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs text-muted font-mono">
              vs. €{costWithDefaultEur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              default liability
            </span>
          </div>
        </div>

        {/* Quick summary comparison pills */}
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <div className="px-3 py-2 rounded-xl bg-surface-sunken border border-border">
            <span className="text-muted block text-[10px]">Verified Liability:</span>
            <span className="text-verified font-bold">
              €{costWithVerifiedEur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-surface-sunken border border-border">
            <span className="text-muted block text-[10px]">Default Liability:</span>
            <span className="text-flagged font-bold">
              €{costWithDefaultEur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Assumptions & Methodology Footer */}
      <footer className="mt-4 pt-3 border-t border-border/60 flex items-start gap-2 text-xs text-muted">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong className="text-text font-medium">Assumptions & Legal Basis: </strong>
          Net CBAM liability after free-allocation benchmark adjustment (SEFA). Certificate price of{" "}
          <span className="font-mono text-text font-semibold">€{certificatePrice.toFixed(2)}/tCO₂e</span> based on{" "}
          <span className="font-semibold text-text">{priceQuarter}</span> EU ETS auction quarterly average. Includes{" "}
          <span className="font-mono text-text">{(defaultMarkup * 100).toFixed(0)}%</span> default-value markup and{" "}
          <span className="font-mono text-text">{(freeAllocationFactor * 100).toFixed(1)}%</span> free-allocation
          factor under Regulations (EU) 2023/956, 2025/2620 & 2025/2621.
        </p>
      </footer>
    </div>
  );
};
