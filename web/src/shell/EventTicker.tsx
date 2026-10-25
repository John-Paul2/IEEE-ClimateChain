import React, { useMemo, useState, useEffect } from "react";
import { useData } from "../data/DataContext.tsx";
import { Sparkles, Layers, ShieldAlert, Cpu, FileCheck2, ShieldCheck, BarChart3 } from "lucide-react";
import { formatEventTickerText, formatStepCaption } from "../lib/eventTemplates.ts";

export const EventTicker: React.FC = () => {
  const { scenarioStatus, events, narrationEnabled } = useData();

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
  const isPlaying = scenarioStatus?.status === "playing";
  const caption = scenarioStatus?.current_caption || formatStepCaption(currentStep);

  const stepIcons: Record<number, React.FC<{ className?: string }>> = {
    1: Layers,
    2: Sparkles,
    3: Cpu,
    4: ShieldCheck,
    5: ShieldAlert,
    6: FileCheck2,
    7: BarChart3,
    8: FileCheck2,
  };

  const StepIcon = stepIcons[currentStep] || Sparkles;

  const tickerItems = useMemo(() => {
    if (!events || events.length === 0) {
      return [{ id: "telemetry-connected", text: "Telemetry stream connected" }];
    }

    const seenTexts = new Set<string>();
    const items: Array<{ id: string; text: string }> = [];

    for (const ev of events) {
      const text = formatEventTickerText(ev);
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        const id =
          ev.event_id ||
          (ev.data as any)?.event_id ||
          (ev.seq !== undefined ? `seq-${ev.batch_id ?? 0}-${ev.seq}` : "") ||
          `evt-${text.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        items.push({ id, text });
      }
    }

    return items.length > 0
      ? items.slice(-12)
      : [{ id: "telemetry-connected", text: "Telemetry stream connected" }];
  }, [events]);

  const staticReducedMotionEvents = useMemo(() => {
    return tickerItems.slice(-3);
  }, [tickerItems]);

  // Only show the visible ticker bar when the story playback is actively running
  const showVisibleBar = isPlaying && narrationEnabled;

  if (!showVisibleBar) {
    return (
      <div data-testid="demo-caption-area" aria-live="polite" className="sr-only">
        {caption}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Real-Time Event Ticker & Story Narration"
      className="bg-[#0A0A0A] text-white border-b border-[#262626] text-xs font-mono min-h-9 px-4 py-1 flex flex-wrap items-center justify-between overflow-hidden select-none ticker-container max-w-full"
    >
      {/* Demo Caption Area */}
      <div
        data-testid="demo-caption-area"
        aria-live="polite"
        className="flex items-center gap-2 min-w-0 flex-1 md:flex-initial md:shrink-0 max-w-full md:max-w-xl xl:max-w-2xl pr-2 md:pr-4 md:border-r border-[#262626] z-10 bg-[#0A0A0A]"
      >
        <div className="p-1 rounded-chip bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30 flex-shrink-0">
          <StepIcon className="w-3 h-3" aria-hidden="true" />
        </div>
        {currentStep > 0 ? (
          <span className="shrink-0 px-2 py-0.5 rounded-pill bg-[#FF6B6B]/20 text-[#FF6B6B] border border-[#FF6B6B]/40 font-bold text-[10px]">
            STEP {currentStep}/{totalSteps}
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-pill bg-white/10 text-white/80 border border-white/20 font-semibold text-[10px]">
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
          <div className="flex items-center gap-4 py-0.5 text-[11px] text-white/80">
            {staticReducedMotionEvents.map((item, i) => {
              const isNewest = i === staticReducedMotionEvents.length - 1;
              return (
                <span
                  key={`static-${item.id}`}
                  className={`inline-flex items-center gap-1.5 truncate ${
                    isNewest
                      ? "bg-[#FF6B6B]/20 text-white border border-[#FF6B6B]/40 px-2 py-0.5 rounded-pill font-semibold"
                      : ""
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] shrink-0" />
                  <span className="truncate">{item.text}</span>
                  {i < staticReducedMotionEvents.length - 1 && <span className="opacity-40 ml-2">|</span>}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden whitespace-nowrap h-6 flex items-center">
            <div className="animate-ticker-marquee flex items-center gap-6 w-max hover:[animation-play-state:paused] cursor-default">
              {tickerItems.map((item, i) => {
                const isNewest = i === tickerItems.length - 1;
                return (
                  <span
                    key={`track1-${item.id}`}
                    className={`inline-flex items-center gap-2 shrink-0 whitespace-nowrap text-[11px] px-2 ${
                      isNewest
                        ? "text-white font-bold bg-[#FF6B6B]/20 border border-[#FF6B6B]/50 px-2.5 py-0.5 rounded-pill"
                        : "text-white/75 hover:text-white"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] shrink-0" />
                    <span>{item.text}</span>
                  </span>
                );
              })}
              {tickerItems.map((item, i) => {
                const isNewest = i === tickerItems.length - 1;
                return (
                  <span
                    key={`track2-${item.id}`}
                    aria-hidden="true"
                    className={`inline-flex items-center gap-2 shrink-0 whitespace-nowrap text-[11px] px-2 ${
                      isNewest
                        ? "text-white font-bold bg-[#FF6B6B]/20 border border-[#FF6B6B]/50 px-2.5 py-0.5 rounded-pill"
                        : "text-white/75 hover:text-white"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] shrink-0" />
                    <span>{item.text}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
