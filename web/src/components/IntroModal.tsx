import React, { useState, useEffect, useRef } from "react";
import { X, ArrowRight, ArrowLeft, Play } from "lucide-react";
import { deploymentConfig } from "../chain/deploymentConfig";
import rawSummary from "../../../results/benchmark_summary.json" with { type: "json" };

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartStory: () => void;
}

export const IntroModal: React.FC<IntroModalProps> = ({
  isOpen,
  onClose,
  onStartStory,
}) => {
  const [slide, setSlide] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Safe stat values from repo data
  const contractCount = Object.keys(deploymentConfig?.contracts || {}).length;

  let attacksTotal: number | null = null;
  let attacksBelow50: number | null = null;
  try {
    if (rawSummary && typeof rawSummary === "object") {
      const summaryObj = rawSummary as any;
      const attacks = Object.values(summaryObj.attacks || {}) as any[];
      attacksTotal = summaryObj.n_attacks ?? attacks.length;
      attacksBelow50 = attacks.filter(
        (a) =>
          a?.detectors?.proposed?.recall?.mean !== undefined &&
          a.detectors.proposed.recall.mean < 0.5
      ).length;
    }
  } catch {
    // leave as null
  }

  // Focus trap & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    prevFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      prevFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const slides = [
    {
      title: "Seal",
      text: "Each reading is signed and linked to the last.",
      svg: (
        <svg
          viewBox="0 0 340 120"
          className="w-full h-32 sm:h-36 select-none"
          aria-label="Packets dropping into a hash chain"
        >
          <style>{`
            @keyframes s1Drop1 {
              0% { transform: translateY(-20px); opacity: 0; }
              15%, 85% { transform: translateY(0); opacity: 1; }
              95%, 100% { transform: translateY(0); opacity: 0.2; }
            }
            @keyframes s1Draw1 {
              0%, 15% { stroke-dashoffset: 40; opacity: 0; }
              30%, 85% { stroke-dashoffset: 0; opacity: 1; }
              95%, 100% { stroke-dashoffset: 0; opacity: 0.2; }
            }
            @keyframes s1Drop2 {
              0%, 25% { transform: translateY(-20px); opacity: 0; }
              40%, 85% { transform: translateY(0); opacity: 1; }
              95%, 100% { transform: translateY(0); opacity: 0.2; }
            }
            @keyframes s1Draw2 {
              0%, 40% { stroke-dashoffset: 40; opacity: 0; }
              55%, 85% { stroke-dashoffset: 0; opacity: 1; }
              95%, 100% { stroke-dashoffset: 0; opacity: 0.2; }
            }
            @keyframes s1Drop3 {
              0%, 50% { transform: translateY(-20px); opacity: 0; }
              65%, 85% { transform: translateY(0); opacity: 1; }
              95%, 100% { transform: translateY(0); opacity: 0.2; }
            }
            @keyframes s1Badge {
              0%, 65% { opacity: 0; transform: scale(0.6); }
              75%, 85% { opacity: 1; transform: scale(1); }
              95%, 100% { opacity: 0.2; }
            }
            .s1-p1 { animation: ${prefersReducedMotion ? "none" : "s1Drop1 4s ease-in-out infinite"}; }
            .s1-l1 { stroke-dasharray: 40; animation: ${prefersReducedMotion ? "none" : "s1Draw1 4s ease-in-out infinite"}; }
            .s1-p2 { animation: ${prefersReducedMotion ? "none" : "s1Drop2 4s ease-in-out infinite"}; }
            .s1-l2 { stroke-dasharray: 40; animation: ${prefersReducedMotion ? "none" : "s1Draw2 4s ease-in-out infinite"}; }
            .s1-p3 { animation: ${prefersReducedMotion ? "none" : "s1Drop3 4s ease-in-out infinite"}; }
            .s1-bd { transform-origin: 290px 40px; animation: ${prefersReducedMotion ? "none" : "s1Badge 4s ease-in-out infinite"}; }
            @media (prefers-reduced-motion: reduce) {
              .s1-p1, .s1-p2, .s1-p3 { transform: none !important; opacity: 1 !important; animation: none !important; }
              .s1-l1, .s1-l2 { stroke-dashoffset: 0 !important; opacity: 1 !important; animation: none !important; }
              .s1-bd { opacity: 1 !important; transform: none !important; animation: none !important; }
            }
          `}</style>
          {/* Packet 1 */}
          <g className="s1-p1">
            <rect x="25" y="38" width="65" height="46" rx="8" fill="var(--surface-soft)" stroke="var(--hairline-strong)" strokeWidth="1.5" />
            <text x="57" y="58" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--ink)">#001</text>
            <text x="57" y="72" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="var(--muted-strong)">e8a2..f1</text>
          </g>
          {/* Link 1 */}
          <line x1="90" y1="61" x2="135" y2="61" stroke="#E5383B" strokeWidth="2" strokeLinecap="round" className="s1-l1" />
          <polygon points="135,61 129,57 129,65" fill="#E5383B" className="s1-l1" />
          {/* Packet 2 */}
          <g className="s1-p2">
            <rect x="135" y="38" width="65" height="46" rx="8" fill="var(--surface-soft)" stroke="var(--hairline-strong)" strokeWidth="1.5" />
            <text x="167" y="58" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--ink)">#002</text>
            <text x="167" y="72" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="var(--muted-strong)">3b49..c4</text>
          </g>
          {/* Link 2 */}
          <line x1="200" y1="61" x2="245" y2="61" stroke="#E5383B" strokeWidth="2" strokeLinecap="round" className="s1-l2" />
          <polygon points="245,61 239,57 239,65" fill="#E5383B" className="s1-l2" />
          {/* Packet 3 */}
          <g className="s1-p3">
            <rect x="245" y="38" width="65" height="46" rx="8" fill="var(--surface-soft)" stroke="#E5383B" strokeWidth="1.5" />
            <text x="277" y="58" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--ink)">#003</text>
            <text x="277" y="72" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="var(--muted-strong)">9f71..a0</text>
          </g>
          {/* Signed Seal Badge */}
          <g className="s1-bd">
            <circle cx="295" cy="40" r="10" fill="#E5383B" />
            <path d="M291 40 L294 43 L299 37" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      ),
    },
    {
      title: "Check",
      text: "Physics and AI test every batch.",
      svg: (
        <svg
          viewBox="0 0 340 120"
          className="w-full h-32 sm:h-36 select-none"
          aria-label="Telemetry points on a line with one drifting off"
        >
          <style>{`
            @keyframes s2Drift {
              0%, 20% { transform: translateY(0); }
              50%, 85% { transform: translateY(-38px); }
              95%, 100% { transform: translateY(0); }
            }
            @keyframes s2Color {
              0%, 20% { fill: #0E9F6E; }
              50%, 85% { fill: #E5383B; }
              95%, 100% { fill: #0E9F6E; }
            }
            @keyframes s2Alert {
              0%, 35% { opacity: 0; transform: scale(0.6); }
              50%, 85% { opacity: 1; transform: scale(1); }
              95%, 100% { opacity: 0; }
            }
            @keyframes s2Guide {
              0%, 25% { opacity: 0; }
              50%, 85% { opacity: 1; }
              95%, 100% { opacity: 0; }
            }
            .s2-drifter { animation: ${prefersReducedMotion ? "none" : "s2Drift 4s ease-in-out infinite"}; }
            .s2-dot { animation: ${prefersReducedMotion ? "none" : "s2Color 4s ease-in-out infinite"}; }
            .s2-alt { transform-origin: 220px 24px; animation: ${prefersReducedMotion ? "none" : "s2Alert 4s ease-in-out infinite"}; }
            .s2-gd { animation: ${prefersReducedMotion ? "none" : "s2Guide 4s ease-in-out infinite"}; }
            @media (prefers-reduced-motion: reduce) {
              .s2-drifter { transform: translateY(-38px) !important; animation: none !important; }
              .s2-dot { fill: #E5383B !important; animation: none !important; }
              .s2-alt { opacity: 1 !important; transform: none !important; animation: none !important; }
              .s2-gd { opacity: 1 !important; animation: none !important; }
            }
          `}</style>
          {/* Safe physical corridor */}
          <rect x="25" y="52" width="290" height="32" rx="4" fill="var(--surface-soft)" opacity="0.6" />
          <line x1="25" y1="68" x2="315" y2="68" stroke="var(--hairline-strong)" strokeWidth="1" strokeDasharray="3 3" />
          {/* Normal points on line */}
          <circle cx="50" cy="68" r="5" fill="#0E9F6E" />
          <circle cx="105" cy="65" r="5" fill="#0E9F6E" />
          <circle cx="160" cy="71" r="5" fill="#0E9F6E" />
          <circle cx="275" cy="67" r="5" fill="#0E9F6E" />
          {/* Drifting point */}
          <g className="s2-drifter">
            <line x1="220" y1="68" x2="220" y2="68" stroke="#E5383B" strokeWidth="1.5" strokeDasharray="2 2" className="s2-gd" />
            <circle cx="220" cy="68" r="6" fill="#0E9F6E" className="s2-dot" />
          </g>
          {/* Alert flag */}
          <g className="s2-alt">
            <rect x="185" y="14" width="70" height="18" rx="4" fill="#E5383B" />
            <text x="220" y="26" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#FFFFFF">Anomalous</text>
          </g>
        </svg>
      ),
    },
    {
      title: "Judge",
      text: "Five verifiers vote. A flagged cheat loses a deposit.",
      svg: (
        <svg
          viewBox="0 0 340 120"
          className="w-full h-32 sm:h-36 select-none"
          aria-label="Five verifiers voting, deposit bar shrinking"
        >
          <style>{`
            @keyframes s3Vote {
              0%, 30% { fill: var(--surface-soft); stroke: var(--hairline-strong); }
              45%, 85% { fill: #E5383B; stroke: #E5383B; }
              95%, 100% { fill: var(--surface-soft); stroke: var(--hairline-strong); }
            }
            @keyframes s3Clean {
              0%, 20% { fill: var(--surface-soft); stroke: var(--hairline-strong); }
              35%, 85% { fill: #0E9F6E; stroke: #0E9F6E; }
              95%, 100% { fill: var(--surface-soft); stroke: var(--hairline-strong); }
            }
            @keyframes s3Bar {
              0%, 45% { width: 250px; fill: #0E9F6E; }
              60%, 85% { width: 50px; fill: #E5383B; }
              95%, 100% { width: 250px; fill: #0E9F6E; }
            }
            @keyframes s3Text {
              0%, 50% { opacity: 0; }
              60%, 85% { opacity: 1; }
              95%, 100% { opacity: 0; }
            }
            .s3-vclean { animation: ${prefersReducedMotion ? "none" : "s3Clean 4s ease-in-out infinite"}; }
            .s3-vflag { animation: ${prefersReducedMotion ? "none" : "s3Vote 4s ease-in-out infinite"}; }
            .s3-bar { animation: ${prefersReducedMotion ? "none" : "s3Bar 4s ease-in-out infinite"}; }
            .s3-slash { animation: ${prefersReducedMotion ? "none" : "s3Text 4s ease-in-out infinite"}; }
            @media (prefers-reduced-motion: reduce) {
              .s3-vclean { fill: #0E9F6E !important; stroke: #0E9F6E !important; animation: none !important; }
              .s3-vflag { fill: #E5383B !important; stroke: #E5383B !important; animation: none !important; }
              .s3-bar { width: 50px !important; fill: #E5383B !important; animation: none !important; }
              .s3-slash { opacity: 1 !important; animation: none !important; }
            }
          `}</style>
          {/* 5 Verifiers */}
          {[
            { id: "V0", cx: 45, isFlag: false },
            { id: "V1", cx: 105, isFlag: false },
            { id: "V2", cx: 165, isFlag: true },
            { id: "V3", cx: 225, isFlag: true },
            { id: "V4", cx: 285, isFlag: true },
          ].map((v) => (
            <g key={v.id}>
              <circle
                cx={v.cx}
                cy={32}
                r="16"
                strokeWidth="2"
                className={v.isFlag ? "s3-vflag" : "s3-vclean"}
              />
              <text x={v.cx} y={36} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--ink)">
                {v.id}
              </text>
            </g>
          ))}
          {/* Deposit Bar Background */}
          <rect x="45" y="78" width="250" height="18" rx="5" fill="var(--surface-soft)" stroke="var(--hairline)" />
          {/* Shrinking Deposit Bar */}
          <rect x="45" y="78" width="250" height="18" rx="5" className="s3-bar" />
          {/* Slashed Label */}
          <text x="170" y="112" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#E5383B" className="s3-slash">
            3/5 Fraud Votes · Deposit Slashed
          </text>
        </svg>
      ),
    },
    {
      title: "Prove",
      text: "Buyers re-check the proof in their browser.",
      svg: (
        <svg
          viewBox="0 0 340 120"
          className="w-full h-32 sm:h-36 select-none"
          aria-label="Browser checking valid and tampered reports"
        >
          <style>{`
            @keyframes s4Tick {
              0%, 15% { stroke-dashoffset: 24; opacity: 0; }
              35%, 85% { stroke-dashoffset: 0; opacity: 1; }
              95%, 100% { stroke-dashoffset: 24; opacity: 0; }
            }
            @keyframes s4Cross {
              0%, 35% { stroke-dashoffset: 24; opacity: 0; }
              55%, 85% { stroke-dashoffset: 0; opacity: 1; }
              95%, 100% { stroke-dashoffset: 24; opacity: 0; }
            }
            .s4-t { stroke-dasharray: 24; animation: ${prefersReducedMotion ? "none" : "s4Tick 4s ease-in-out infinite"}; }
            .s4-c { stroke-dasharray: 24; animation: ${prefersReducedMotion ? "none" : "s4Cross 4s ease-in-out infinite"}; }
            @media (prefers-reduced-motion: reduce) {
              .s4-t, .s4-c { stroke-dashoffset: 0 !important; opacity: 1 !important; animation: none !important; }
            }
          `}</style>
          {/* Authentic Document */}
          <g>
            <rect x="45" y="16" width="95" height="82" rx="8" fill="var(--surface-soft)" stroke="var(--hairline-strong)" strokeWidth="1.5" />
            <line x1="60" y1="34" x2="110" y2="34" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
            <line x1="60" y1="46" x2="125" y2="46" stroke="var(--muted-strong)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="60" y1="58" x2="105" y2="58" stroke="var(--muted-strong)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="92" cy="78" r="11" fill="#0E9F6E" />
            <path d="M87 78 L90 81 L97 75" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="s4-t" />
          </g>
          {/* Tampered Document */}
          <g>
            <rect x="200" y="16" width="95" height="82" rx="8" fill="var(--surface-soft)" stroke="#E5383B" strokeWidth="1.5" />
            <line x1="215" y1="34" x2="265" y2="34" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
            <line x1="215" y1="46" x2="280" y2="46" stroke="#E5383B" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="215" y1="58" x2="260" y2="58" stroke="var(--muted-strong)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="247" cy="78" r="11" fill="#E5383B" />
            <path d="M243 74 L251 82 M251 74 L243 82" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" className="s4-c" />
          </g>
        </svg>
      ),
    },
  ];

  const current = slides[slide];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-slide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg bg-surface border border-hairline rounded-card shadow-2xl overflow-hidden flex flex-col focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-hairline">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <span
              id="intro-slide-title"
              className="text-xs font-mono font-semibold text-muted-strong uppercase tracking-wider"
            >
              Step {slide + 1} of {slides.length} · {current.title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close intro modal"
            className="p-1 rounded-lg text-muted hover:text-ink hover:bg-surface-soft border border-transparent hover:border-hairline transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          <h2 className="text-lg sm:text-xl font-heading font-bold text-ink tracking-tight text-center">
            {current.text}
          </h2>

          <div className="rounded-xl bg-surface-soft/60 border border-hairline p-2 sm:p-3 flex items-center justify-center">
            {current.svg}
          </div>

          {/* Slide 4 stats row from data, hiding any that are missing */}
          {slide === 3 && (
            <div className="pt-2 border-t border-hairline flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-mono text-muted-strong">
              {contractCount > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-surface-soft border border-hairline flex items-center gap-1.5">
                  <strong className="text-ink font-semibold">{contractCount}</strong>
                  <span>contracts deployed</span>
                </div>
              )}
              {attacksTotal !== null && (
                <div className="px-2.5 py-1 rounded-lg bg-surface-soft border border-hairline flex items-center gap-1.5">
                  <strong className="text-ink font-semibold">{attacksTotal}</strong>
                  <span>attacks tested</span>
                </div>
              )}
              {attacksBelow50 !== null && (
                <div className="px-2.5 py-1 rounded-lg bg-surface-soft border border-hairline flex items-center gap-1.5">
                  <strong className="text-flagged-ink dark:text-red-400 font-semibold">{attacksBelow50}</strong>
                  <span>attacks below 50%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-surface-soft/40 border-t border-hairline flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-muted-strong hover:text-ink transition-colors cursor-pointer"
          >
            Skip
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5" aria-label="Progress dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`transition-all rounded-pill ${
                  i === slide
                    ? "w-5 h-2 bg-brand"
                    : "w-2 h-2 bg-hairline-strong hover:bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Next / Back / Start the story */}
          <div className="flex items-center gap-2">
            {slide > 0 && (
              <button
                type="button"
                onClick={() => setSlide((prev) => prev - 1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-hairline text-xs font-semibold text-ink bg-surface hover:bg-hairline/60 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            )}

            {slide < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => setSlide((prev) => prev + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <span>Next</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartStory}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-pressed transition-colors cursor-pointer shadow-sm"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Start the story</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
