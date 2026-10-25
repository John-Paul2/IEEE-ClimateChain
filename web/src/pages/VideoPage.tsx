import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Check,
  X,
  Lock,
  ArrowRight,
  ExternalLink,
  Globe,
  GitBranch,
  Factory,
  Cpu,
  Shield,
  Layers,
  Server,
} from "lucide-react";
import { Chip } from "../components/Chip";
import { calculateCbamComparison, getIllustrativeExampleInputs } from "../lib/cbam";
import testnetDeployment from "../../../deployments/testnet.json" with { type: "json" };

type SceneId = "hook" | "why" | "close";

/* -------------------------------------------------------------------------- */
/* ANIMATED EURO COUNTER (Rolls smoothly up to the exact cent value)          */
/* -------------------------------------------------------------------------- */
const AnimatedEuro: React.FC<{
  value: number;
  startTime: number;
  currentTime: number;
  duration?: number;
}> = ({ value, startTime, currentTime, duration = 1.3 }) => {
  const progress = Math.min(1, Math.max(0, (currentTime - startTime) / duration));
  // easeOutCubic curve
  const ease = 1 - Math.pow(1 - progress, 3);
  const current = value * ease;

  return (
    <span>
      €
      {current.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* SPLIT-FLAP DIGIT DISPLAY                                                   */
/* -------------------------------------------------------------------------- */
const SplitFlapDigit: React.FC<{
  currentDigit: string;
  nextDigit: string;
  isFlipped: boolean;
}> = ({ currentDigit, nextDigit, isFlipped }) => {
  return (
    <div className="relative w-7 h-10 bg-[#1A1A1C] border border-[#38383D] rounded-lg overflow-hidden flex items-center justify-center font-mono text-[24px] font-bold select-none shadow-sm">
      {/* Top half subtle plate */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.04] pointer-events-none" />
      {/* Center mechanical split line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-[0.5px] h-[1px] bg-black/90 z-20 pointer-events-none" />

      {/* Current Digit */}
      <motion.div
        animate={isFlipped ? { y: -40, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="absolute inset-0 flex items-center justify-center text-[#F5F5F7]"
      >
        {currentDigit}
      </motion.div>

      {/* Next Digit */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={isFlipped ? { y: 0, opacity: 1 } : { y: 40, opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="absolute inset-0 flex items-center justify-center text-amber-400 font-bold"
      >
        {nextDigit}
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* SCENE #hook (15 s)                                                         */
/* -------------------------------------------------------------------------- */
const SceneHook: React.FC<{ time: number }> = ({ time }) => {
  // Timeline events
  const cursorActive = time >= 1.6 && time < 3.4;
  const isFlipped = time >= 2.6;
  const hashTampered = time >= 3.6;
  const chainCracked = time >= 4.2;
  const stampLanded = time >= 4.8;

  // Right half timeline (starts at 6 s)
  const rightActive = time >= 6.0;
  const sensorEmits = time >= 6.4;
  const squeezeActive = time >= 7.4;
  const lockClosed = time >= 8.4;
  const chartVisible = time >= 9.2;
  const bondDraining = time >= 12.2;
  const bondSlashed = time >= 13.0;
  const punchlineActive = time >= 13.4;

  return (
    <div className="relative w-full h-full p-16 flex flex-col justify-between">
      {/* Header with Major Title */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-4xl sm:text-5xl font-heading font-black tracking-tight text-white">
          Two ways to fake the numbers<span className="text-[#E5383B]">.</span>
        </h1>
        <div className="text-sm font-mono text-[#8E8E93]">
          00:{Math.floor(time).toString().padStart(2, "0")} / 00:15
        </div>
      </div>

      {/* Main Two-Column Stage */}
      <div className="w-full grid grid-cols-2 gap-16 flex-1 items-center my-4">
        {/* LEFT HALF: AFTER SEALING (Locked h-[670px], zero layout shift, overflow-hidden) */}
        <div className="relative w-full bg-[#141416] border border-[#262629] rounded-2xl p-8 h-[670px] flex flex-col justify-between overflow-hidden">
          <div className="shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-[#E5383B]" />
              <h2 className="text-3xl font-heading font-bold tracking-wider text-[#F5F5F7]">
                AFTER SEALING
              </h2>
            </div>
            <p className="text-sm font-mono text-[#8E8E93] mt-1.5">Hash chain tampering</p>
          </div>

          {/* Three Packet Cards with Proportional flex-1 min-w-0 (Can NEVER overflow) */}
          <div className="flex items-center justify-between gap-3 relative py-2 w-full">
            {/* Packet #001 */}
            <div className="flex-1 min-w-0 h-[200px] bg-[#1A1A1C] border border-[#262629] rounded-2xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#8E8E93]">Seq #001</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="text-[32px] font-mono font-bold text-[#F5F5F7]">405.2</div>
              <div className="text-xs font-mono text-[#8E8E93] truncate">0x7a3f...e1</div>
            </div>

            {/* Arrow #001 -> #002 */}
            <div className="w-8 h-8 flex items-center justify-center text-emerald-500 shrink-0">
              <ArrowRight className="w-5 h-5" />
            </div>

            {/* Packet #002 (Target) */}
            <div
              className={`relative flex-1 min-w-0 h-[200px] rounded-2xl p-5 flex flex-col justify-between transition-colors duration-300 border ${
                hashTampered ? "bg-red-500/10 border-[#E5383B]" : "bg-[#1A1A1C] border-[#262629]"
              }`}
            >
              {/* Straight MISMATCH Stamp anchored on #002 */}
              <motion.div
                animate={{ opacity: stampLanded ? 1 : 0, scale: stampLanded ? 1 : 0.85 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="absolute -top-3 -right-3 z-30 px-3 py-1 text-xs font-black font-mono tracking-widest border-2 rounded uppercase select-none shadow-xl border-red-600 text-red-600 bg-red-500/25 dark:text-red-400 dark:border-red-400 backdrop-blur-sm pointer-events-none"
              >
                MISMATCH
              </motion.div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#8E8E93]">Seq #002</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    hashTampered ? "bg-[#E5383B]" : "bg-emerald-500"
                  }`}
                />
              </div>

              {/* Split-flap value: 412.0 -> 330.0 with comfortable spacing */}
              <div className="flex items-center gap-1.5 my-1 justify-center">
                <SplitFlapDigit currentDigit="4" nextDigit="3" isFlipped={isFlipped} />
                <SplitFlapDigit currentDigit="1" nextDigit="3" isFlipped={isFlipped} />
                <SplitFlapDigit currentDigit="2" nextDigit="0" isFlipped={isFlipped} />
                <span className="text-[26px] font-mono font-bold text-[#8E8E93] ml-1">.0</span>
              </div>

              <div
                className={`text-xs font-mono truncate font-semibold transition-colors text-center ${
                  hashTampered ? "text-[#E5383B]" : "text-[#8E8E93]"
                }`}
              >
                {hashTampered ? "0xf41a...89" : "0x9c4b...d8"}
              </div>

              {/* Simulated Editing Cursor anchored DIRECTLY over the flipping digit inside Packet #002 */}
              {cursorActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className="absolute left-1/2 -translate-x-3.5 top-[80px] pointer-events-none z-30"
                >
                  <div className="w-7 h-7 border-2 border-white bg-black/90 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xl">
                    ✎
                  </div>
                </motion.div>
              )}
            </div>

            {/* Arrow #002 -> #003 */}
            <div className="w-8 h-8 flex items-center justify-center shrink-0 relative">
              <motion.div
                animate={{ opacity: chainCracked ? 0 : 1 }}
                className="absolute text-emerald-500"
              >
                <ArrowRight className="w-5 h-5" />
              </motion.div>
              <motion.div
                animate={{ opacity: chainCracked ? 1 : 0, scale: chainCracked ? 1 : 0.8 }}
                transition={{ duration: 0.25 }}
                className="absolute flex flex-col items-center text-[#E5383B]"
              >
                <span className="text-[10px] font-mono font-bold tracking-wider leading-none">
                  CRACK
                </span>
                <X className="w-5 h-5 stroke-[3]" />
              </motion.div>
            </div>

            {/* Packet #003 */}
            <div className="flex-1 min-w-0 h-[200px] bg-[#1A1A1C] border border-[#262629] rounded-2xl p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#8E8E93]">Seq #003</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    chainCracked ? "bg-[#E5383B]" : "bg-emerald-500"
                  }`}
                />
              </div>
              <div className="text-[32px] font-mono font-bold text-[#F5F5F7]">418.0</div>
              <div className="text-xs font-mono text-[#8E8E93] truncate">
                {chainCracked ? "prev: 0x9c4b" : "0x3e12...a5"}
              </div>
            </div>
          </div>

          {/* Verification Status Banner (Fixed h-[52px]) */}
          <div className="h-[52px] bg-[#1A1A1C] border border-[#262629] rounded-xl px-5 py-3 flex items-center justify-between text-xs font-mono shrink-0">
            <span className="text-[#8E8E93]">Chain verification:</span>
            <span className={hashTampered ? "text-[#E5383B] font-bold" : "text-emerald-400"}>
              {hashTampered ? "Cryptographic break detected downstream" : "Sequential hash chain intact"}
            </span>
          </div>
        </div>

        {/* RIGHT HALF: BEFORE SEALING (Locked h-[670px], zero layout shift, overflow-hidden) */}
        <div
          className={`relative w-full bg-[#141416] border border-[#262629] rounded-2xl p-8 h-[670px] flex flex-col justify-between transition-opacity duration-500 overflow-hidden ${
            rightActive ? "opacity-100" : "opacity-25"
          }`}
        >
          <div className="shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500" />
              <h2 className="text-3xl font-heading font-bold tracking-wider text-[#F5F5F7]">
                BEFORE SEALING
              </h2>
            </div>
            <p className="text-sm font-mono text-[#8E8E93] mt-1.5">Source sensor spoofing</p>
          </div>

          {/* Sensor emission -> Squeeze -> Valid Signature (Bigger boxes, strictly fixed h-[110px], zero layout shift) */}
          <div className="h-[110px] flex items-center justify-between gap-4 shrink-0">
            {/* Sensor readout (Spacious box, NO text wrap) */}
            <div className="flex-1 h-[110px] bg-[#1A1A1C] border border-[#262629] rounded-2xl px-6 py-3 flex items-center gap-4 shrink-0 min-w-0">
              <Cpu className="w-8 h-8 text-emerald-400 shrink-0" />
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-xs font-mono text-[#8E8E93] whitespace-nowrap mb-1">
                  Sensor emits
                </span>
                <div className="h-8 flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-3xl font-mono font-bold text-white tabular-nums tracking-tight">
                    {sensorEmits ? "412" : "--"}
                  </span>
                  <span className="text-sm font-mono text-[#8E8E93] font-medium">
                    {sensorEmits ? "t/h" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Squeeze transition (Fixed w-[130px] h-[110px], invariant coordinates) */}
            <div className="w-[130px] min-w-[130px] max-w-[130px] h-[110px] flex flex-col items-center justify-center shrink-0">
              <div className="h-6 flex items-center justify-center shrink-0">
                <motion.div
                  animate={{ opacity: squeezeActive ? 1 : 0, scale: squeezeActive ? 1 : 0.85 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="px-2.5 py-0.5 bg-[#E5383B]/20 border border-[#E5383B] text-[#FF6B6B] text-xs font-mono font-bold rounded whitespace-nowrap shadow-sm"
                >
                  -20% squeeze
                </motion.div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#8E8E93] my-1 shrink-0" />
              <div className="h-6 flex items-center justify-center text-sm font-mono font-bold text-amber-400 whitespace-nowrap shrink-0">
                <motion.span
                  animate={{ opacity: squeezeActive ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  330 t/h
                </motion.span>
              </div>
            </div>

            {/* Padlock + Chip (Spacious container, comfortable chip fit) */}
            <div className="flex-1 h-[110px] bg-[#1A1A1C] border border-[#262629] rounded-2xl px-6 py-3 flex items-center gap-4 shrink-0 min-w-0">
              <Lock
                className={`w-8 h-8 shrink-0 transition-colors ${
                  lockClosed ? "text-emerald-400" : "text-[#8E8E93]"
                }`}
              />
              <div className="relative flex-1 h-[32px] flex items-center min-w-0">
                <motion.span
                  animate={{ opacity: lockClosed ? 0 : 1 }}
                  transition={{ duration: 0.25 }}
                  className="absolute text-sm font-mono text-[#8E8E93] whitespace-nowrap"
                >
                  Unsigned
                </motion.span>
                <motion.div
                  animate={{ opacity: lockClosed ? 1 : 0, scale: lockClosed ? 1 : 0.9 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute whitespace-nowrap"
                >
                  <Chip variant="verified" label="signature valid" size="md" />
                </motion.div>
              </div>
            </div>
          </div>

          {/* Physics Divergence Chart (Fixed h-[160px], SVG always mounted, zero layout shift) */}
          <div className="h-[160px] bg-[#1A1A1C] border border-[#262629] rounded-2xl p-5 flex flex-col justify-between overflow-hidden shrink-0">
            <div className="flex items-center justify-between text-xs font-mono shrink-0">
              <span className="text-blue-400 font-semibold">Expected CO2 from heat input (412)</span>
              <span className="text-[#FF6B6B] font-semibold">Reported emissions (330)</span>
            </div>

            <svg className="w-full h-20" viewBox="0 0 400 60" preserveAspectRatio="none">
              {/* Expected Line (412) */}
              <line
                x1="0"
                y1="16"
                x2="400"
                y2="16"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />

              {/* Shaded Divergence Gap & Reported Line */}
              <motion.g
                animate={{ opacity: chartVisible ? 1 : 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <polygon points="140,16 400,16 400,50 140,50" fill="rgba(229, 56, 59, 0.25)" />
                <polyline
                  points="0,16 140,16 190,50 400,50"
                  fill="none"
                  stroke="#E5383B"
                  strokeWidth="3"
                />
              </motion.g>
            </svg>

            <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93] shrink-0">
              <span>t = 0</span>
              <span className="text-[#FF6B6B] font-semibold tracking-wide">Physics gap detected</span>
              <span>t = end</span>
            </div>
          </div>

          {/* Verifier Quorum V1-V5 (Fixed h-[50px], shrink-0, zero layout shift) */}
          <div className="h-[50px] flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-[#8E8E93]">Quorum:</span>
              <div className="flex items-center gap-2.5">
                {[
                  { name: "V1", pass: true, trigger: 10.8 },
                  { name: "V2", pass: false, trigger: 11.1 },
                  { name: "V3", pass: false, trigger: 11.4 },
                  { name: "V4", pass: false, trigger: 11.7 },
                  { name: "V5", pass: false, trigger: 12.0 },
                ].map((node) => {
                  const active = time >= node.trigger;
                  const isRed = active && !node.pass;
                  const isGreen = active && node.pass;
                  return (
                    <div
                      key={node.name}
                      className={`w-9 h-9 rounded-full font-mono text-sm font-bold flex items-center justify-center border transition-all duration-300 shrink-0 ${
                        isRed
                          ? "bg-red-500/20 border-[#E5383B] text-[#FF6B6B]"
                          : isGreen
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                          : "bg-[#1A1A1C] border-[#262629] text-[#8E8E93]"
                      }`}
                    >
                      {active ? (node.pass ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />) : node.name}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bond Slashed Chip */}
            <div className="w-[170px] flex justify-end shrink-0">
              <motion.div
                animate={{ opacity: bondSlashed ? 1 : 0, scale: bondSlashed ? 1 : 0.85 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <Chip variant="flagged" label="Deposit slashed" size="md" />
              </motion.div>
            </div>
          </div>

          {/* Operator Bond Bar */}
          <div className="h-[50px] flex flex-col justify-between shrink-0">
            <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93]">
              <span>Operator bond</span>
            </div>
            <div className="w-full bg-[#1A1A1C] border border-[#262629] rounded-full h-4 overflow-hidden">
              <motion.div
                style={{
                  width: bondDraining ? `${Math.max(0, 100 - (time - 12.2) * 120)}%` : "100%",
                }}
                className="h-full bg-[#E5383B] transition-all duration-100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Punchline Banner (Always mounted, zero layout shift) */}
      <div className="h-16 flex items-center justify-center shrink-0">
        <motion.div
          animate={{ opacity: punchlineActive ? 1 : 0, y: punchlineActive ? 0 : 8 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="text-2xl font-heading font-bold tracking-wide text-center"
        >
          <span className="text-[#FF6B6B]">Chain breaks.</span>{" "}
          <span className="text-amber-400">Physics catches.</span>{" "}
          <span className="text-emerald-400">Deposit pays.</span>
        </motion.div>
      </div>

      {/* Tiny bottom-left label */}
      <div className="text-xs font-mono tracking-wider text-[#8E8E93]/60 uppercase">
        Illustrative animation
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* SCENE #why (25 s)                                                          */
/* -------------------------------------------------------------------------- */
const SceneWhy: React.FC<{ time: number }> = ({ time }) => {
  // Phase mapping (Strictly mutually exclusive windows to prevent overlap glitch)
  const currentPhase: 1 | 2 | 3 = time < 4.8 ? 1 : time < 13.8 ? 2 : 3;

  // Expected calculated CBAM values (India, CN 7201, 500 t, 2.10 tCO2e/t, €82.32/t):
  // Default cost: €65,989.77, Verified cost: €42,733.34, Savings: €23,256.43
  const { defaultCost, verifiedCost, savingsCost } = useMemo(() => {
    try {
      const inputs = getIllustrativeExampleInputs("India");
      const res = calculateCbamComparison(inputs);
      if (res.cost_with_default_eur && res.cost_with_verified_eur && res.savings_eur) {
        return {
          defaultCost: res.cost_with_default_eur,
          verifiedCost: res.cost_with_verified_eur,
          savingsCost: res.savings_eur,
        };
      }
    } catch {
      // Fallback verified parameters
    }
    return {
      defaultCost: 65989.77,
      verifiedCost: 42733.34,
      savingsCost: 23256.43,
    };
  }, []);

  return (
    <div className="relative w-full h-full p-16 flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Chip
          variant="ILLUSTRATIVE"
          label="1 Jan 2026 · EU CBAM definitive period"
          size="md"
        />
        <div className="text-xs font-mono text-[#8E8E93]">
          00:{Math.floor(time).toString().padStart(2, "0")} / 00:25
        </div>
      </div>

      {/* Main Content Area: Fixed height container with cross-fade (NO layout shift) */}
      <div className="relative flex-1 w-full flex items-center justify-center my-4 overflow-hidden">
        {/* PHASE 1: Steel Coil Shipment Transit (0 - 4.8s) */}
        <motion.div
          key="phase1"
          animate={{
            opacity: currentPhase === 1 ? 1 : 0,
            scale: currentPhase === 1 ? 1 : 0.98,
            pointerEvents: currentPhase === 1 ? "auto" : "none",
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-full bg-[#141416] border border-[#262629] rounded-2xl p-12 flex flex-col justify-between h-[600px]">
            {/* Header in card */}
            <div className="flex items-center justify-between border-b border-[#262629] pb-5">
              <div>
                <span className="text-xs font-mono text-[#8E8E93] uppercase">
                  Cross-Border Telemetry
                </span>
                <h2 className="text-3xl font-heading font-bold text-white mt-1">
                  Maritime Cargo In Transit
                </h2>
              </div>
              <div className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full">
                500 t Pig Iron · CN 7201
              </div>
            </div>

            {/* Pipeline Corridor: Origin -> Transit Track -> Destination */}
            <div className="flex items-center justify-between gap-8 my-auto py-8 relative">
              {/* Origin Card (Strictly locked width: 340px) */}
              <div className="w-[340px] min-w-[340px] max-w-[340px] h-[180px] bg-[#1A1A1C] border border-[#262629] rounded-2xl p-7 flex flex-col justify-between shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#8E8E93]">ORIGIN</span>
                  <Factory className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-heading font-bold text-white">India Factory</div>
                  <div className="text-xs font-mono text-[#8E8E93] mt-0.5">Ex-works dispatch</div>
                </div>
              </div>

              {/* Transit Track Corridor */}
              <div className="flex-1 flex flex-col items-center justify-center relative px-6">
                {/* Track Line */}
                <div className="w-full h-2 bg-[#262629] rounded-full relative overflow-hidden">
                  <div className="absolute inset-0 border-b border-dashed border-[#8E8E93]/60" />
                </div>

                {/* Status marker */}
                <div className="text-xs font-mono text-[#8E8E93] mt-4">
                  {time < 3.2 ? "Maritime transit · 6,800 nm" : "Arrived at EU border"}
                </div>

                {/* Sliding Steel Coil Pallet */}
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.min(1, Math.max(0, time / 3.2)) * 74}%`,
                    top: "-30px",
                  }}
                  className="flex items-center gap-3 bg-[#222226] border border-amber-500/50 px-4 py-2.5 rounded-xl shadow-md pointer-events-none transition-all duration-75"
                >
                  <Layers className="w-6 h-6 text-amber-400 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-bold text-white leading-tight">
                      500 t Coil
                    </span>
                    <span className="text-[11px] font-mono text-amber-400 leading-tight">
                      2.10 tCO2e/t
                    </span>
                  </div>
                </div>
              </div>

              {/* Destination Card (Strictly locked width: 340px, invariant size) */}
              <div
                className={`w-[340px] min-w-[340px] max-w-[340px] h-[180px] bg-[#1A1A1C] rounded-2xl p-7 flex flex-col justify-between shrink-0 border transition-colors duration-300 ${
                  time >= 3.2 ? "border-emerald-500 bg-emerald-500/10" : "border-[#262629]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#8E8E93]">DESTINATION</span>
                  <Shield className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="text-2xl font-heading font-bold text-white">EU importer</div>
                  <div className="text-xs font-mono text-emerald-400 mt-0.5">
                    {time >= 3.2 ? "Shipment received" : "Awaiting declaration"}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom summary bar */}
            <div className="flex items-center justify-between border-t border-[#262629] pt-5 text-xs font-mono text-[#8E8E93]">
              <span>Mandatory compliance under EU CBAM</span>
              <span className="text-amber-400">Default markup applies if unverified</span>
            </div>
          </div>
        </motion.div>

        {/* PHASE 2: Two Price Tags with Animated Euro Counters (4.8s - 13.8s) */}
        <motion.div
          key="phase2"
          animate={{
            opacity: currentPhase === 2 ? 1 : 0,
            scale: currentPhase === 2 ? 1 : 0.98,
            pointerEvents: currentPhase === 2 ? "auto" : "none",
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col justify-center"
        >
          <div className="grid grid-cols-2 gap-12 items-center">
            {/* Left Price Tag: Default Markup (Animated Ticker) */}
            <div className="bg-[#141416] border border-amber-500/40 rounded-2xl p-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                  No proof: default +10% markup
                </span>
                <span className="text-xs font-mono text-[#8E8E93]">Estimated</span>
              </div>
              <div className="text-5xl font-mono font-bold text-amber-400">
                <AnimatedEuro
                  value={defaultCost}
                  startTime={4.8}
                  currentTime={time}
                  duration={1.2}
                />
              </div>
              <p className="text-xs font-mono text-[#8E8E93]">Cost using EU default values (+10%)</p>
            </div>

            {/* Right Price Tag: Verified Data (Animated Ticker) */}
            <div className="bg-[#141416] border border-emerald-500/40 rounded-2xl p-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                  Verified data
                </span>
                <Chip variant="verified" label="Verified data" size="sm" />
              </div>
              <div className="text-5xl font-mono font-bold text-emerald-400">
                <AnimatedEuro
                  value={verifiedCost}
                  startTime={4.8}
                  currentTime={time}
                  duration={1.2}
                />
              </div>
              <p className="text-xs font-mono text-[#8E8E93]">Verified installation cost</p>
            </div>

            {/* Savings Bracket (Animated Counter) */}
            <div className="col-span-2 flex items-center justify-center">
              <div className="bg-[#1A1A1C] border border-emerald-500/40 px-6 py-3 rounded-full flex items-center gap-4">
                <span className="text-xs font-mono text-[#8E8E93]">indicative</span>
                <span className="text-2xl font-mono font-bold text-emerald-400">
                  Save{" "}
                  <AnimatedEuro
                    value={savingsCost}
                    startTime={5.2}
                    currentTime={time}
                    duration={1.2}
                  />
                </span>
                <span className="text-xs font-mono text-emerald-500 font-semibold">
                  (35% net saving)
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* PHASE 3: Flow Diagram with Minimalist Server Icon and Connectors (13.8s - 25.0s) */}
        <motion.div
          key="phase3"
          animate={{
            opacity: currentPhase === 3 ? 1 : 0,
            scale: currentPhase === 3 ? 1 : 0.98,
            pointerEvents: currentPhase === 3 ? "auto" : "none",
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col justify-center gap-8"
        >
          {/* Flow Diagram with Minimalist Vector Icons */}
          <div className="flex items-center justify-between gap-4">
            {/* 1. Smokestack */}
            <div className="flex-1 bg-[#141416] border border-[#262629] rounded-2xl p-6 flex flex-col items-center text-center gap-3">
              <Factory className="w-10 h-10 text-[#8E8E93]" />
              <span className="text-base font-heading font-bold text-white">Smokestack</span>
              <span className="text-[11px] font-mono text-[#8E8E93]">Industrial emissions</span>
            </div>

            <div className="flex items-center text-[#8E8E93]/60 shrink-0">
              <ArrowRight className="w-5 h-5 stroke-[1.5]" />
            </div>

            {/* 2. Sensor */}
            <div className="flex-1 bg-[#141416] border border-[#262629] rounded-2xl p-6 flex flex-col items-center text-center gap-3">
              <Cpu className="w-10 h-10 text-emerald-400" />
              <span className="text-base font-heading font-bold text-white">CEMS Sensor</span>
              <span className="text-[11px] font-mono text-[#8E8E93]">Raw stack telemetry</span>
            </div>

            <div className="flex items-center text-[#8E8E93]/60 shrink-0">
              <ArrowRight className="w-5 h-5 stroke-[1.5]" />
            </div>

            {/* 3. Operator's computer (Minimalist Server line icon, NO emoji) */}
            <div className="flex-1 bg-[#1A1A1C] border-2 border-amber-500 rounded-2xl p-6 flex flex-col items-center text-center gap-3 relative shadow-lg">
              <div className="w-3 h-3 rounded-full bg-amber-500 absolute top-3 right-3 animate-pulse" />
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Server className="w-6 h-6 stroke-[1.8]" />
              </div>
              <span className="text-base font-heading font-bold text-amber-400">
                Operator's computer
              </span>
              <span className="text-xs font-mono text-amber-300 font-semibold">
                controlled by the factory
              </span>
            </div>

            <div className="flex items-center text-[#8E8E93]/60 shrink-0">
              <ArrowRight className="w-5 h-5 stroke-[1.5]" />
            </div>

            {/* 4. EU Importer */}
            <div className="flex-1 bg-[#141416] border border-[#262629] rounded-2xl p-6 flex flex-col items-center text-center gap-3">
              <Shield className="w-10 h-10 text-blue-400" />
              <span className="text-base font-heading font-bold text-white">EU importer</span>
              <span className="text-[11px] font-mono text-[#8E8E93]">Customs declaration</span>
            </div>
          </div>

          {/* Dilemma Banner */}
          <div className="flex flex-col items-center justify-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 font-black text-2xl animate-pulse">
              ?
            </div>
            <div className="text-2xl font-heading font-bold text-amber-400">
              Nobody downstream can check.
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer Area */}
      <div className="flex items-end justify-between">
        <div className="text-[11px] font-mono tracking-wider text-[#8E8E93]/60 uppercase">
          Illustrative animation
        </div>
        <div className="text-right text-xs font-mono text-amber-400/80 leading-relaxed">
          <div>500 t pig iron, India</div>
          <div>example plant 2.10 tCO2e/t · EU legal parameters</div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* SCENE #close (15 s) - Smooth fade with zero layout shifts                   */
/* -------------------------------------------------------------------------- */
const SceneClose: React.FC<{ time: number }> = ({ time }) => {
  // Explorer URL from testnet.json
  const explorerBase = testnetDeployment?.explorerBaseUrl || "https://sepolia.arbiscan.io";
  const rawContracts = (testnetDeployment?.contracts || {}) as Record<string, string>;
  const rawDetail = (testnetDeployment?.contracts_detail || {}) as Record<
    string,
    { address?: string; explorerUrl?: string }
  >;
  const batchAnchorAddress = rawDetail["BatchAnchor"]?.address || rawContracts["BatchAnchor"];
  const batchAnchorExplorerUrl =
    rawDetail["BatchAnchor"]?.explorerUrl ||
    (batchAnchorAddress && batchAnchorAddress !== "null" && batchAnchorAddress.startsWith("0x")
      ? `${explorerBase}/address/${batchAnchorAddress}`
      : null);

  return (
    <div className="relative w-full h-full p-16 flex flex-col justify-between">
      {/* Top Track Label */}
      <div className="flex items-center justify-between">
        <Chip
          variant="ILLUSTRATIVE"
          label="Track 4: Climate Data & Environmental Monitoring"
          size="md"
        />
        <div className="text-xs font-mono text-[#8E8E93]">
          00:{Math.floor(time).toString().padStart(2, "0")} / 00:15
        </div>
      </div>

      {/* Center Hero: Elements exist statically in DOM; purely opacity/translateY animated */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
        {/* Brand Shield Icon */}
        <motion.div
          animate={{
            opacity: time >= 0.2 ? 1 : 0,
            scale: time >= 0.2 ? 1 : 0.85,
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-14 h-14 rounded-2xl bg-[#E5383B]/15 border border-[#E5383B]/40 flex items-center justify-center text-[#E5383B] shadow-sm"
        >
          <Shield className="w-7 h-7 stroke-[2.2]" />
        </motion.div>

        {/* Large Wordmark */}
        <motion.div
          animate={{
            opacity: time >= 0.5 ? 1 : 0,
            y: time >= 0.5 ? 0 : 20,
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-8xl font-heading font-black tracking-tight text-white flex items-center justify-center"
        >
          <span>VeriCEMS</span>
          <motion.span
            animate={{
              opacity: time >= 0.8 ? 1 : 0,
              scale: time >= 0.8 ? 1 : 2,
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-[#E5383B] inline-block ml-0.5"
          >
            .
          </motion.span>
        </motion.div>

        {/* Razor Center Divider Line */}
        <div className="w-56 h-[2px] bg-[#262629] relative overflow-hidden rounded-full my-1">
          <motion.div
            animate={{
              scaleX: time >= 1.0 ? 1 : 0,
            }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full w-full bg-[#E5383B]"
          />
        </div>

        {/* Tagline on two lines (each <= 8 words) - Smooth fade with no layout shift */}
        <div className="flex flex-col gap-1.5 items-center">
          <motion.div
            animate={{
              opacity: time >= 1.2 ? 1 : 0,
              y: time >= 1.2 ? 0 : 12,
            }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-2xl font-heading text-[#8E8E93]"
          >
            Don't trust the sensor.
          </motion.div>
          <motion.div
            animate={{
              opacity: time >= 1.6 ? 1 : 0,
              y: time >= 1.6 ? 0 : 12,
            }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="text-2xl font-heading font-bold text-[#FF6B6B]"
          >
            Verify the physics and the chain.
          </motion.div>
        </div>

        {/* Three Link Chips */}
        <motion.div
          animate={{
            opacity: time >= 2.1 ? 1 : 0,
            y: time >= 2.1 ? 0 : 12,
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex items-center gap-4 mt-2"
        >
          <a
            href="https://ieee-climate-chain.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-[#1A1A1C] border border-[#262629] px-4 py-2 rounded-full text-xs font-mono text-white hover:border-[#E5383B] transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>ieee-climate-chain.vercel.app</span>
          </a>

          <a
            href="https://github.com/John-Paul2/IEEE-ClimateChain"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-[#1A1A1C] border border-[#262629] px-4 py-2 rounded-full text-xs font-mono text-white hover:border-[#E5383B] transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5 text-blue-400" />
            <span>github.com/John-Paul2/IEEE-ClimateChain</span>
          </a>

          {batchAnchorExplorerUrl && (
            <a
              href={batchAnchorExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 bg-[#1A1A1C] border border-[#262629] px-4 py-2 rounded-full text-xs font-mono text-white hover:border-[#E5383B] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span>BatchAnchor on Arbiscan</span>
            </a>
          )}
        </motion.div>
      </div>

      {/* Stats Row (4 tiles) */}
      <motion.div
        animate={{
          opacity: time >= 2.6 ? 1 : 0,
          y: time >= 2.6 ? 0 : 14,
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="grid grid-cols-4 gap-6 pt-4 border-t border-[#262629]"
      >
        <div className="bg-[#141416] border border-[#262629] rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-bold text-white">6</div>
          <div className="text-xs font-mono text-[#8E8E93]">contracts</div>
        </div>

        <div className="bg-[#141416] border border-[#262629] rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-bold text-white">14</div>
          <div className="text-xs font-mono text-[#8E8E93]">attacks tested</div>
        </div>

        <div className="bg-[#141416] border border-[#262629] rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-bold text-white">29</div>
          <div className="text-xs font-mono text-[#8E8E93]">EPA facilities</div>
        </div>

        <div className="bg-[#141416] border border-[#262629] rounded-xl p-3 text-center">
          <div className="text-xl font-mono font-bold text-emerald-400">100%</div>
          <div className="text-xs font-mono text-[#8E8E93]">open source</div>
        </div>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN VIDEO PAGE ROUTE (/video#hook, /video#why, /video#close)              */
/* -------------------------------------------------------------------------- */
export const VideoPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse active scene from URL hash
  const hash = location.hash.replace("#", "").toLowerCase();
  const activeScene: SceneId =
    hash === "why" || hash === "close" ? (hash as SceneId) : "hook";

  // Duration mapping
  const duration = activeScene === "why" ? 25 : 15;

  // Animation timeline clock
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  // Responsive stage scaling (1920x1080 -> window)
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const scaleX = window.innerWidth / 1920;
      const scaleY = window.innerHeight / 1080;
      setScale(Math.min(scaleX, scaleY));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Hide scrollbars & cursor while on video route
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    const origCursor = document.body.style.cursor;
    document.body.style.overflow = "hidden";
    document.body.style.cursor = "none";
    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.cursor = origCursor;
    };
  }, []);

  // Reset clock on scene change or replay
  useEffect(() => {
    setTime(0);
    setIsPaused(false);
  }, [activeScene, replayKey]);

  // RequestAnimationFrame Clock loop
  useEffect(() => {
    let animId: number;
    let lastNow = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastNow) / 1000;
      lastNow = now;

      if (!isPaused) {
        setTime((prev) => {
          if (prev >= duration) return duration;
          return Math.min(duration, prev + delta);
        });
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPaused, duration, replayKey]);

  // Keyboard controls: Space (pause/play), R (replay), 1/2/3 (scene jump)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.code === "KeyR" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        setReplayKey((k) => k + 1);
      } else if (e.key === "1") {
        navigate("/video#hook");
      } else if (e.key === "2") {
        navigate("/video#why");
      } else if (e.key === "3") {
        navigate("/video#close");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0E0E0E] text-[#F5F5F7] flex items-center justify-center select-none cursor-none dark">
      {/* Fixed 1920x1080 Stage */}
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="relative w-[1920px] h-[1080px] bg-[#0E0E0E] text-[#F5F5F7] overflow-hidden"
      >
        {activeScene === "hook" && <SceneHook time={time} />}
        {activeScene === "why" && <SceneWhy time={time} />}
        {activeScene === "close" && <SceneClose time={time} />}
      </div>
    </div>
  );
};

export default VideoPage;
