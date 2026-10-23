import React, { useMemo, useState, useEffect } from "react";
import { useData } from "../data/DataContext.tsx";
import { Sparkles, Layers, ShieldAlert, Cpu, FileCheck2, ShieldCheck, BarChart3 } from "lucide-react";
import { formatEventTickerText, formatStepCaption } from "../lib/eventTemplates.ts";

export const EventTicker: React.FC = () => {
  const { scenarioStatus, events } = useData();

  // Reduced motion media query detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const currentStep = scenarioStatus?.current_step || 0;
  const totalSteps = scenarioStatus?.total_steps || 8;
  const caption = formatStepCaption(currentStep);

  const stepIcons: Record<number, React.FC<{ className?: string }>> = {
    1: Layers,
    2: Sparkles,
    3: ShieldAlert,
    4: Cpu,
    5: FileCheck2,
    6: ShieldCheck,
    7: BarChart3,
    8: FileCheck2,
  };

  const StepIcon = stepIcons[currentStep] || Sparkles;

  // Generate ticker items ONLY from events using templates
  const tickerItems = useMemo(() => {
    if (!events || events.length === 0) {
      return ["Telemetry stream connected"];
    }

    const formatted = events
      .slice(-12)
      .map((ev) => formatEventTickerText(ev))
      .filter(Boolean);

    return Array.from(new Set(formatted));
  }, [events]);

  // Under prefers-reduced-motion, show the static last 3 events
  const staticReducedMotionEvents = useMemo(() => {
    return tickerItems.slice(-3);
  }, [tickerItems]);

  return (
    <div
      role="region"
      aria-label="Real-Time Event Ticker & Story Narration"
      className="bg-[#0A0A0A] text-white border-b border-black text-xs font-mono min-h-11 px-4 py-1.5 flex flex-wrap items-center justify-between overflow-hidden select-none ticker-container max-w-full"
    >
      {/* Demo Caption Area */}
      <div
        data-testid="demo-caption-area"
        aria-live="polite"
        className="flex items-center gap-2.5 min-w-0 flex-1 md:flex-initial md:shrink-0 max-w-full md:max-w-xl xl:max-w-2xl pr-2 md:pr-4 md:border-r border-[#262626] z-10 bg-[#0A0A0A]"
      >
        <div className="p-1 rounded-chip bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30 flex-shrink-0">
          <StepIcon className="w-3.5 h-3.5" aria-hidden="true" />
        </div>
        {currentStep > 0 ? (
          <span className="shrink-0 px-2 py-0.5 rounded-chip bg-[#FF6B6B]/20 text-[#FF6B6B] border border-[#FF6B6B]/40 font-bold text-[10.5px]">
            STEP {currentStep}/{totalSteps}
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-chip bg-white/10 text-white/80 border border-white/20 font-semibold text-[10.5px]">
            RUN
          </span>
        )}
        <p className="truncate text-white font-sans text-xs font-medium tracking-tight min-w-0 flex-1">
          {caption}
        </p>
      </div>

      {/* Marquee / Reduced-Motion Event Ticker */}
      <div className="flex-1 overflow-hidden relative ml-4 hidden md:block group">
        {prefersReducedMotion ? (
          // Static last 3 events under prefers-reduced-motion with static highlight on newest
          <div className="flex items-center gap-4 py-1 text-[12px] text-white/80">
            {staticReducedMotionEvents.map((ev, i) => {
              const isNewest = i === staticReducedMotionEvents.length - 1;
              return (
                <span
                  key={`static-${i}`}
                  className={`inline-flex items-center gap-1.5 truncate ${
                    isNewest
                      ? "bg-[#FF6B6B]/20 text-white border border-[#FF6B6B]/40 px-2 py-0.5 rounded-chip font-semibold"
                      : ""
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] shrink-0" />
                  <span className="truncate">{ev}</span>
                  {i < staticReducedMotionEvents.length - 1 && <span className="opacity-40 ml-2">|</span>}
                </span>
              );
            })}
          </div>
        ) : (
          // Continuous marquee with highlighted newest item
          <div className="animate-ticker-marquee flex items-center gap-8 py-1 group-hover:[animation-play-state:paused]">
            {tickerItems.concat(tickerItems).map((ev, i) => {
              const isNewest = (i % tickerItems.length) === tickerItems.length - 1;
              return (
                <span
                  key={`${ev}-${i}`}
                  className={`inline-flex items-center gap-2 transition-all duration-200 cursor-default whitespace-nowrap text-[12px] ${
                    isNewest
                      ? "text-white font-bold bg-[#FF6B6B]/20 border border-[#FF6B6B]/50 px-2.5 py-0.5 rounded-chip shadow-[0_0_8px_rgba(255,107,107,0.35)]"
                      : "text-white/75 hover:text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                  <span>{ev}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
