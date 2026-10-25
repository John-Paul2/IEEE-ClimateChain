import React, { useState, useEffect, useRef } from "react";
import { X, ArrowRight, ArrowLeft, Play, Pause, Compass } from "lucide-react";
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
  const [scene, setScene] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
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

  // Reset progress on scene change
  useEffect(() => {
    setProgress(0);
  }, [scene]);

  // Reset to scene 0 when opening
  useEffect(() => {
    if (isOpen) {
      setScene(0);
      setProgress(0);
      setIsPaused(false);
    }
  }, [isOpen]);

  // 4-second auto-advance timer with smooth progress
  useEffect(() => {
    if (!isOpen || isPaused || prefersReducedMotion) return;

    const intervalMs = 40;
    const stepIncrement = (intervalMs / 4000) * 100;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (scene < 4) {
            setScene((s) => s + 1);
            return 0;
          }
          return 100;
        }
        return prev + stepIncrement;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, scene, prefersReducedMotion]);

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

  // 5 Scenes according to prompt specifications
  const scenes = [
    {
      id: "sensor-reports",
      caption: "A sensor reports a number.",
      svg: (
        <svg
          viewBox="0 0 360 140"
          className="w-full h-36 select-none"
          aria-label="A sensor reports a number"
        >
          <style>{`
            @keyframes puff1 {
              0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
              30% { opacity: 0.7; }
              100% { transform: translate(12px, -36px) scale(1.4); opacity: 0; }
            }
            @keyframes puff2 {
              0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
              40% { opacity: 0.6; }
              100% { transform: translate(18px, -44px) scale(1.5); opacity: 0; }
            }
            @keyframes numCount {
              0%, 15% { opacity: 0; }
              30%, 100% { opacity: 1; }
            }
            @keyframes packetEmit {
              0%, 20% { transform: translate(95px, 68px) scale(0); opacity: 0; }
              50% { transform: translate(160px, 68px) scale(1); opacity: 1; }
              100% { transform: translate(250px, 68px) scale(1); opacity: 1; }
            }
            .s1-puff1 { transform-origin: 65px 40px; animation: ${prefersReducedMotion ? "none" : "puff1 2.2s infinite ease-out"}; }
            .s1-puff2 { transform-origin: 65px 40px; animation: ${prefersReducedMotion ? "none" : "puff2 2.6s 0.8s infinite ease-out"}; }
            .s1-num { animation: ${prefersReducedMotion ? "none" : "numCount 4s infinite"}; }
            .s1-pkt { animation: ${prefersReducedMotion ? "none" : "packetEmit 4s infinite ease-in-out"}; }
            @media (prefers-reduced-motion: reduce) {
              .s1-puff1, .s1-puff2 { opacity: 0.4 !important; transform: none !important; animation: none !important; }
              .s1-num { opacity: 1 !important; animation: none !important; }
              .s1-pkt { transform: translate(220px, 68px) scale(1) !important; opacity: 1 !important; animation: none !important; }
            }
          `}</style>
          {/* Industrial Chimney Stack */}
          <path d="M45 125 L55 52 L75 52 L85 125 Z" fill="#262626" stroke="#404040" strokeWidth="1.5" />
          <line x1="50" y1="52" x2="80" y2="52" stroke="#E5383B" strokeWidth="2.5" strokeLinecap="round" />
          {/* Chimney Puffs */}
          <circle cx="65" cy="40" r="10" fill="#737373" className="s1-puff1" />
          <circle cx="68" cy="36" r="14" fill="#525252" className="s1-puff2" />

          {/* Sensor Unit on Stack */}
          <rect x="74" y="65" width="22" height="20" rx="3" fill="#171717" stroke="#E5383B" strokeWidth="1.5" />
          <circle cx="85" cy="75" r="2.5" fill="#E5383B" />

          {/* White Data Packet in transit */}
          <g className="s1-pkt">
            <rect x="0" y="0" width="18" height="18" rx="4" fill="#FFFFFF" />
            <text x="9" y="12.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#0A0A0A" fontFamily="monospace">CO₂</text>
          </g>

          {/* Reported Number Readout */}
          <g className="s1-num">
            <rect x="230" y="52" width="105" height="42" rx="6" fill="#171717" stroke="#333333" strokeWidth="1.5" />
            <text x="242" y="68" fontSize="9" fill="#A3A3A3" fontFamily="sans-serif">STACK SENSOR</text>
            <text x="242" y="86" fontSize="16" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">37.9</text>
            <text x="286" y="86" fontSize="10" fill="#737373" fontFamily="monospace">tCO₂/h</text>
          </g>
        </svg>
      ),
    },
    {
      id: "anyone-can-change",
      caption: "Anyone can change it.",
      svg: (
        <svg
          viewBox="0 0 720 280"
          className="w-full h-36 select-none"
          textRendering="geometricPrecision"
          shapeRendering="geometricPrecision"
          aria-label="Anyone can change it"
        >
          <style>{`
            @keyframes pulseRed {
              0%, 25% { stroke: #404040; stroke-width: 2; }
              45%, 65% { stroke: #E5383B; stroke-width: 4; }
              85%, 100% { stroke: #E5383B; stroke-width: 2; }
            }
            @keyframes strikethrough {
              0%, 30% { stroke-dashoffset: 120; opacity: 0; }
              45%, 100% { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes newNumber {
              0%, 35% { opacity: 0; }
              50%, 100% { opacity: 1; }
            }
            @keyframes packetTamper {
              0%, 30% { fill: #FFFFFF; }
              50%, 100% { fill: #E5383B; }
            }
            .s2-box { animation: ${prefersReducedMotion ? "none" : "pulseRed 4s infinite ease-in-out"}; }
            .s2-strike { stroke-dasharray: 120; animation: ${prefersReducedMotion ? "none" : "strikethrough 4s infinite ease-out"}; }
            .s2-new { animation: ${prefersReducedMotion ? "none" : "newNumber 4s infinite ease-out"}; }
            .s2-pkt { animation: ${prefersReducedMotion ? "none" : "packetTamper 4s infinite"}; }
            @media (prefers-reduced-motion: reduce) {
              .s2-box { stroke: #E5383B !important; stroke-width: 3 !important; animation: none !important; }
              .s2-strike { stroke-dashoffset: 0 !important; opacity: 1 !important; animation: none !important; }
              .s2-new { opacity: 1 !important; animation: none !important; }
              .s2-pkt { fill: #E5383B !important; animation: none !important; }
            }
          `}</style>
          {/* Central editable number panel */}
          <g className="s2-box">
            <rect x="180" y="60" width="360" height="152" rx="14" fill="#171717" stroke="#E5383B" strokeWidth="2.5" />
            <text x="360" y="96" textAnchor="middle" fontSize="16" fontWeight="bold" letterSpacing="0.08em" fill="#E5383B" fontFamily="sans-serif">
              UNPROTECTED TELEMETRY
            </text>

            {/* Original 37.9 with strike */}
            <text x="270" y="156" textAnchor="middle" fontSize="36" fontWeight="bold" fill="#737373" fontFamily="monospace">
              37.9
            </text>
            <line x1="220" y1="144" x2="320" y2="144" stroke="#E5383B" strokeWidth="4" strokeLinecap="round" className="s2-strike" />

            {/* Changed to 26.5 */}
            <g className="s2-new">
              <text x="430" y="156" textAnchor="middle" fontSize="40" fontWeight="bold" fill="#E5383B" fontFamily="monospace">
                26.5
              </text>
              <text x="430" y="188" textAnchor="middle" fontSize="15" fontWeight="bold" letterSpacing="0.05em" fill="#E5383B" fontFamily="sans-serif">
                ALTERED (-30%)
              </text>
            </g>
          </g>

          {/* Tampered Data Packet: turns red */}
          <g transform="translate(84, 116)">
            <rect x="0" y="0" width="40" height="40" rx="8" className="s2-pkt" fill="#E5383B" />
            <text x="20" y="27" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">!</text>
          </g>
        </svg>
      ),
    },
    {
      id: "we-seal-it",
      caption: "We seal it.",
      svg: (
        <svg
          viewBox="0 0 360 140"
          className="w-full h-36 select-none"
          aria-label="We seal it"
        >
          <style>{`
            @keyframes linkDraw {
              0%, 15% { stroke-dashoffset: 30; opacity: 0; }
              35%, 100% { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes flyHash {
              0%, 35% { transform: translate(165px, 68px) scale(0.6); opacity: 0; }
              60% { opacity: 1; transform: translate(220px, 50px) scale(1); }
              90%, 100% { transform: translate(280px, 68px) scale(0.8); opacity: 0.3; }
            }
            @keyframes lockSnap {
              0%, 20% { transform: scale(0.5); opacity: 0; }
              40%, 100% { transform: scale(1); opacity: 1; }
            }
            .s3-link { stroke-dasharray: 30; animation: ${prefersReducedMotion ? "none" : "linkDraw 4s infinite ease-out"}; }
            .s3-fly { animation: ${prefersReducedMotion ? "none" : "flyHash 4s infinite ease-in-out"}; }
            .s3-lock { transform-origin: 165px 42px; animation: ${prefersReducedMotion ? "none" : "lockSnap 4s infinite ease-out"}; }
            @media (prefers-reduced-motion: reduce) {
              .s3-link { stroke-dashoffset: 0 !important; opacity: 1 !important; animation: none !important; }
              .s3-fly { transform: translate(280px, 68px) scale(0.8) !important; opacity: 1 !important; animation: none !important; }
              .s3-lock { transform: none !important; opacity: 1 !important; animation: none !important; }
            }
          `}</style>
          {/* Packet 1 */}
          <g transform="translate(30, 48)">
            <rect x="0" y="0" width="55" height="44" rx="6" fill="#171717" stroke="#404040" strokeWidth="1.5" />
            <text x="27" y="20" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">#001</text>
            <text x="27" y="34" textAnchor="middle" fontSize="7" fill="#A3A3A3" fontFamily="monospace">0x7a..c2</text>
          </g>

          {/* Link 1 */}
          <line x1="85" y1="70" x2="115" y2="70" stroke="#E5383B" strokeWidth="2" strokeLinecap="round" className="s3-link" />

          {/* Packet 2 with Padlock */}
          <g transform="translate(115, 48)">
            <rect x="0" y="0" width="55" height="44" rx="6" fill="#171717" stroke="#E5383B" strokeWidth="1.5" />
            <text x="27" y="20" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">#002</text>
            <text x="27" y="34" textAnchor="middle" fontSize="7" fill="#E5383B" fontFamily="monospace">SEALED</text>
          </g>

          {/* Padlock Icon */}
          <g className="s3-lock" transform="translate(134, 28)">
            <rect x="3" y="8" width="14" height="11" rx="2" fill="#E5383B" />
            <path d="M6 8 V5 A4 4 0 0 1 14 5 V8" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
          </g>

          {/* Fingerprint / Hash Flying */}
          <g className="s3-fly">
            <rect x="-8" y="-8" width="16" height="16" rx="4" fill="#FFFFFF" />
            <text x="0" y="3" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#0A0A0A" fontFamily="monospace">#</text>
          </g>

          {/* Blockchain Icon */}
          <g transform="translate(270, 48)">
            <rect x="0" y="0" width="60" height="44" rx="6" fill="#171717" stroke="#525252" strokeWidth="1.5" />
            <path d="M18 16 L30 10 L42 16 L30 22 Z M18 24 L30 30 L42 24" fill="none" stroke="#A3A3A3" strokeWidth="1.5" strokeLinejoin="round" />
            <text x="30" y="38" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#737373" fontFamily="sans-serif">CHAIN</text>
          </g>
        </svg>
      ),
    },
    {
      id: "checkers-judge",
      caption: "Five checkers judge it.",
      svg: (
        <svg
          viewBox="0 0 360 140"
          className="w-full h-36 select-none"
          aria-label="Five checkers judge it"
        >
          <style>{`
            @keyframes vClean {
              0%, 20% { fill: #262626; stroke: #404040; }
              40%, 100% { fill: #0E9F6E; stroke: #0E9F6E; }
            }
            @keyframes vFraud {
              0%, 20% { fill: #262626; stroke: #404040; }
              45%, 100% { fill: #E5383B; stroke: #E5383B; }
            }
            @keyframes shrinkBar {
              0%, 45% { width: 260px; fill: #0E9F6E; }
              65%, 100% { width: 70px; fill: #E5383B; }
            }
            @keyframes slashTag {
              0%, 55% { opacity: 0; transform: translateY(4px); }
              70%, 100% { opacity: 1; transform: translateY(0); }
            }
            .s4-vc { animation: ${prefersReducedMotion ? "none" : "vClean 4s infinite ease-in-out"}; }
            .s4-vf { animation: ${prefersReducedMotion ? "none" : "vFraud 4s infinite ease-in-out"}; }
            .s4-bar { animation: ${prefersReducedMotion ? "none" : "shrinkBar 4s infinite ease-in-out"}; }
            .s4-tag { animation: ${prefersReducedMotion ? "none" : "slashTag 4s infinite ease-out"}; }
            @media (prefers-reduced-motion: reduce) {
              .s4-vc { fill: #0E9F6E !important; stroke: #0E9F6E !important; animation: none !important; }
              .s4-vf { fill: #E5383B !important; stroke: #E5383B !important; animation: none !important; }
              .s4-bar { width: 70px !important; fill: #E5383B !important; animation: none !important; }
              .s4-tag { opacity: 1 !important; transform: none !important; animation: none !important; }
            }
          `}</style>
          {/* Five Verifier Dots */}
          {[
            { id: "V1", cx: 50, isFlag: false },
            { id: "V2", cx: 115, isFlag: false },
            { id: "V3", cx: 180, isFlag: true },
            { id: "V4", cx: 245, isFlag: true },
            { id: "V5", cx: 310, isFlag: true },
          ].map((v) => (
            <g key={v.id}>
              <circle
                cx={v.cx}
                cy={42}
                r="16"
                strokeWidth="2"
                className={v.isFlag ? "s4-vf" : "s4-vc"}
                fill="#262626"
              />
              <text x={v.cx} y={46} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FFFFFF" fontFamily="monospace">
                {v.id}
              </text>
            </g>
          ))}

          {/* Deposit Bar Container */}
          <rect x="50" y="80" width="260" height="16" rx="4" fill="#171717" stroke="#333333" strokeWidth="1" />
          {/* Shrinking Deposit Bar */}
          <rect x="50" y="80" width="260" height="16" rx="4" className="s4-bar" fill="#0E9F6E" />

          {/* Slashed Indicator Label */}
          <g className="s4-tag">
            <text x="180" y="116" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#E5383B" fontFamily="monospace">
              3/5 Fraud Votes · Operator Slashed
            </text>
          </g>
        </svg>
      ),
    },
    {
      id: "buyers-verify",
      caption: "Buyers verify it themselves.",
      svg: (
        <svg
          viewBox="0 0 360 140"
          className="w-full h-36 select-none"
          aria-label="Buyers verify it themselves"
        >
          <style>{`
            @keyframes tickIn {
              0%, 25% { stroke-dashoffset: 24; opacity: 0; }
              45%, 100% { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes savingsCount {
              0%, 30% { opacity: 0; transform: translateY(4px); }
              50%, 100% { opacity: 1; transform: translateY(0); }
            }
            .s5-tick { stroke-dasharray: 24; animation: ${prefersReducedMotion ? "none" : "tickIn 4s infinite ease-out"}; }
            .s5-sav { animation: ${prefersReducedMotion ? "none" : "savingsCount 4s infinite ease-out"}; }
            @media (prefers-reduced-motion: reduce) {
              .s5-tick { stroke-dashoffset: 0 !important; opacity: 1 !important; animation: none !important; }
              .s5-sav { opacity: 1 !important; transform: none !important; animation: none !important; }
            }
          `}</style>
          {/* Browser Window Mockup */}
          <g transform="translate(60, 20)">
            <rect x="0" y="0" width="240" height="100" rx="6" fill="#171717" stroke="#333333" strokeWidth="1.5" />
            {/* Window title bar */}
            <rect x="0" y="0" width="240" height="20" rx="6" fill="#262626" />
            <circle cx="12" cy="10" r="3" fill="#E5383B" />
            <circle cx="22" cy="10" r="3" fill="#D97706" />
            <circle cx="32" cy="10" r="3" fill="#0E9F6E" />
            <text x="120" y="14" textAnchor="middle" fontSize="8" fill="#A3A3A3" fontFamily="monospace">vericems.app/importer</text>

            {/* Verified Green Badge & Tick */}
            <g transform="translate(25, 45)">
              <circle cx="15" cy="15" r="14" fill="#0E9F6E" />
              <path d="M9 15 L13 19 L21 11" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="s5-tick" />
              <text x="38" y="14" fontSize="11" fontWeight="bold" fill="#FFFFFF" fontFamily="sans-serif">CBAM Report Verified</text>
              <text x="38" y="26" fontSize="8" fill="#0E9F6E" fontFamily="monospace">Merkle proof matched</text>
            </g>

            {/* Savings Number Counting Up */}
            <g className="s5-sav" transform="translate(145, 68)">
              <rect x="0" y="0" width="80" height="20" rx="3" fill="#0E9F6E/20" stroke="#0E9F6E/40" strokeWidth="1" />
              <text x="40" y="14" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0E9F6E" fontFamily="monospace">
                €42,850 saved
              </text>
            </g>
          </g>
        </svg>
      ),
    },
  ];

  const current = scenes[scene];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="VeriCEMS Guided Introduction"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg bg-[#0F0F0F] border border-[#262626] rounded-card shadow-2xl overflow-hidden flex flex-col focus:outline-none text-white"
      >
        {/* Header with Step indicator, click-to-pause status, and close */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E5383B]" />
            <span className="text-xs font-mono font-semibold text-[#A3A3A3] uppercase tracking-wider">
              Scene {scene + 1} of {scenes.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Click to pause indicator */}
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="text-[11px] font-mono text-[#A3A3A3] hover:text-white px-2 py-0.5 rounded border border-transparent hover:border-[#333333] flex items-center gap-1 transition-colors cursor-pointer"
              aria-label={isPaused ? "Resume animation" : "Pause animation"}
            >
              {isPaused ? (
                <>
                  <Play className="w-3 h-3 fill-current text-[#E5383B]" />
                  <span>Paused</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Auto-advancing</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close intro modal"
              className="p-1 rounded-lg text-[#737373] hover:text-white hover:bg-[#262626] border border-transparent hover:border-[#333333] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-second Progress Bar per Scene */}
        <div className="w-full h-1 bg-[#262626] overflow-hidden">
          <div
            className="h-full bg-[#E5383B] transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content Area with Click-to-Pause toggle */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Exactly one caption per scene (max 10 words) */}
          <h2 className="text-lg sm:text-xl font-heading font-bold text-white tracking-tight text-center">
            {current.caption}
          </h2>

          <div
            onClick={() => setIsPaused((p) => !p)}
            title="Click animation to pause or resume"
            className="rounded-xl bg-[#171717] border border-[#262626] p-2 sm:p-3 flex items-center justify-center cursor-pointer hover:border-[#404040] transition-colors relative"
          >
            {current.svg}
            {isPaused && (
              <span className="absolute bottom-2 right-2 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/80 text-[#E5383B] border border-[#E5383B]/40">
                Paused (click to resume)
              </span>
            )}
          </div>

          {/* Scene 5 Stats Row from data (hidden if missing) */}
          {scene === 4 && (
            <div className="pt-2 border-t border-[#262626] flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-mono text-[#A3A3A3]">
              {contractCount > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-[#171717] border border-[#262626] flex items-center gap-1.5">
                  <strong className="text-white font-semibold">{contractCount}</strong>
                  <span>contracts deployed</span>
                </div>
              )}
              {attacksTotal !== null && (
                <div className="px-2.5 py-1 rounded-lg bg-[#171717] border border-[#262626] flex items-center gap-1.5">
                  <strong className="text-white font-semibold">{attacksTotal}</strong>
                  <span>attacks tested</span>
                </div>
              )}
              {attacksBelow50 !== null && (
                <div className="px-2.5 py-1 rounded-lg bg-[#171717] border border-[#262626] flex items-center gap-1.5">
                  <strong className="text-[#FF6B6B] font-semibold">{attacksBelow50}</strong>
                  <span>attacks below 50%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#141414] border-t border-[#262626] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[#A3A3A3] hover:text-white transition-colors cursor-pointer"
          >
            Skip
          </button>

          {/* Progress dots for 5 scenes */}
          <div className="flex items-center gap-1.5" aria-label="Scene progress dots">
            {scenes.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setScene(i)}
                aria-label={`Go to scene ${i + 1}`}
                className={`transition-all rounded-pill ${
                  i === scene
                    ? "w-5 h-2 bg-[#E5383B]"
                    : "w-2 h-2 bg-[#404040] hover:bg-[#737373]"
                }`}
              />
            ))}
          </div>

          {/* Navigation controls */}
          <div className="flex items-center gap-2">
            {scene > 0 && (
              <button
                type="button"
                onClick={() => setScene((s) => Math.max(0, s - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#333333] text-xs font-semibold text-white bg-[#171717] hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            )}

            {scene < 4 ? (
              <button
                type="button"
                onClick={() => setScene((s) => Math.min(4, s + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors cursor-pointer shadow-sm"
              >
                <span>Next</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#333333] text-xs font-semibold text-[#A3A3A3] hover:text-white bg-[#171717] hover:bg-[#262626] transition-colors cursor-pointer"
                >
                  <Compass className="w-3 h-3" />
                  <span>Explore on my own</span>
                </button>
                <button
                  type="button"
                  onClick={onStartStory}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E5383B] text-white text-xs font-semibold hover:bg-[#c92a2a] transition-colors cursor-pointer shadow-sm"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Start the story</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
