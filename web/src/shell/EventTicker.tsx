import React, { useMemo, useState, useEffect } from "react";
import { useData } from "../data/DataContext";
import { Sparkles, Layers, ShieldAlert, Cpu, FileCheck2, ShieldCheck, BarChart3 } from "lucide-react";

export const EventTicker: React.FC = () => {
  const { scenarioStatus, batches, events } = useData();

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
  const caption =
    scenarioStatus?.current_caption ||
    "Demo Ready · Press Play or Next Step to begin the VeriCEMS story.";

  const stepIcons: Record<number, React.FC<{ className?: string }>> = {
    1: Layers,
    2: Sparkles,
    3: ShieldAlert,
    4: Cpu,
    5: FileCheck2,
    6: ShieldCheck,
    7: BarChart3,
  };

  const StepIcon = stepIcons[currentStep] || Sparkles;

  // Format real websocket events dynamically
  const tickerItems = useMemo(() => {
    const formattedEvents: string[] = [];

    // 1. Process recent WebSocket events if available
    if (events && events.length > 0) {
      const recent = events.slice(-6);
      for (const ev of recent) {
        const typeStr = ev.type?.toUpperCase() || "";
        if (typeStr.includes("BATCH_ANCHORED") || typeStr.includes("BATCH")) {
          const root = (ev.data?.merkle_root as string) || (ev.data?.root as string);
          const shortRoot = root ? `${root.slice(0, 8)}...` : "";
          formattedEvents.push(
            `Batch #${ev.batch_id || 1} anchored to Layer-2${shortRoot ? ` · Root: ${shortRoot}` : ""}`
          );
        } else if (typeStr.includes("QUORUM") || typeStr.includes("VOTE")) {
          formattedEvents.push(`Committee quorum processed on Batch #${ev.batch_id || 1} · 3 of 5 voted FRAUD`);
        } else if (typeStr.includes("SLASH") || typeStr.includes("CHALLENGE")) {
          formattedEvents.push(`Optimistic challenge resolved · Operator bond slashed`);
        } else if (typeStr.includes("ATTESTATION")) {
          formattedEvents.push(`CBAM period attestation recorded on Layer-2`);
        }
      }
    }

    // 2. Incorporate recent anchored batches
    if (batches && batches.length > 0) {
      batches.slice(-3).forEach((b) => {
        const statusText = b.status === "Quarantined" ? "quarantined" : b.status === "Slashed" ? "slashed" : "verified";
        formattedEvents.push(
          `Batch #${b.batch_id} anchored · ${statusText} · Root: ${b.merkle_root.slice(0, 8)}...`
        );
      });
    }

    // 3. Fallback curated events per design spec
    const defaultEvents = [
      "Batch 12 anchored · 3 of 5 voted FRAUD · bond slashed",
      "P-256 ECDSA gateway signature confirmed on Arbitrum Sepolia",
      "Mass-balance physics bounds: CO₂ stoichiometric ratio within 0.002% tolerance",
      "Autoencoder neural residual: reconstruction anomaly detected at sequence #42",
      "Optimistic Challenge Window: 2-of-3 Arbiter Multisig quorum settlement finalized",
      "EU CBAM quarterly period attestation certificate generated & anchored",
      "Audited actual route saved €25,930.80 compared to default penalty values",
    ];

    return Array.from(new Set([...formattedEvents, ...defaultEvents]));
  }, [events, batches]);

  // Under prefers-reduced-motion, show the static last 3 events
  const staticReducedMotionEvents = useMemo(() => {
    return tickerItems.slice(0, 3);
  }, [tickerItems]);

  return (
    <div
      role="region"
      aria-label="VeriCEMS Real-Time Event Ticker & Story Narration"
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
            STEP {currentStep}/7
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-chip bg-white/10 text-white/80 border border-white/20 font-semibold text-[10.5px]">
            DEMO
          </span>
        )}
        <p className="truncate text-white font-sans text-xs font-medium tracking-tight min-w-0 flex-1">
          {caption}
        </p>
      </div>

      {/* Marquee / Reduced-Motion Event Ticker */}
      <div className="flex-1 overflow-hidden relative ml-4 hidden md:block group">
        {prefersReducedMotion ? (
          // Static last 3 events under prefers-reduced-motion
          <div className="flex items-center gap-4 py-1 text-[12px] text-white/80">
            {staticReducedMotionEvents.map((ev, i) => (
              <span key={`static-${i}`} className="inline-flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B] shrink-0" />
                <span className="truncate">{ev}</span>
                {i < staticReducedMotionEvents.length - 1 && <span className="opacity-40 ml-2">|</span>}
              </span>
            ))}
          </div>
        ) : (
          // Continuous marquee with pause on hover
          <div className="animate-ticker-marquee flex items-center gap-8 py-1 group-hover:[animation-play-state:paused]">
            {tickerItems.concat(tickerItems).map((ev, i) => (
              <span
                key={`${ev}-${i}`}
                className="inline-flex items-center gap-2 text-white/75 hover:text-white transition-colors cursor-default whitespace-nowrap text-[12px]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                <span>{ev}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
