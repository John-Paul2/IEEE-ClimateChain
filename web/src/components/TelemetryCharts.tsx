import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { LineChart as ChartIcon } from "lucide-react";
import type { TelemetryPacket, ChannelConfig } from "../types/telemetry";
import { REGISTERED_CHANNELS } from "../types/telemetry";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export type { ChannelConfig };
export { REGISTERED_CHANNELS };

export interface TelemetryChartsProps {
  packets?: TelemetryPacket[];
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  packets = [],
  isLoading = false,
  isEmpty = false,
  error = null,
  onRetry,
  className = "",
}) => {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Selected channel keys
  const [activeChannels, setActiveChannels] = useState<string[]>([
    "co2_mass_short_tons",
    "heat_input_mmbtu",
    "gross_load_mw",
  ]);

  const toggleChannel = (key: string) => {
    setActiveChannels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card space-y-4 shadow-card ${className}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-52 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-chip" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-chip" />
          <Skeleton className="h-8 w-24 rounded-chip" />
          <Skeleton className="h-8 w-24 rounded-chip" />
        </div>
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <ErrorState title="Telemetry error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || packets.length === 0) {
    return (
      <div className={`p-5 bg-surface border border-hairline rounded-card shadow-card ${className}`}>
        <EmptyState
          icon={ChartIcon}
          title="No telemetry"
          description="Press Play to start the recorded run."
        />
      </div>
    );
  }

  // Base values from first packet for index = 100 calculation
  const firstPacket = packets[0];
  const firstVals = (firstPacket as any)?.values || (firstPacket as any)?.data?.values || (firstPacket as any)?.data || firstPacket || {};
  const co2Base = Number(firstVals.co2_mass_short_tons ?? firstVals.co2_mass ?? firstVals.co2) || 1;
  const heatBase = Number(firstVals.heat_input_mmbtu ?? firstVals.heat_input ?? firstVals.heat) || 1;
  const rawFirstLoad = firstVals.gross_load_mw !== undefined && Number(firstVals.gross_load_mw) > 0
    ? Number(firstVals.gross_load_mw)
    : Number(firstVals.steam_load_1000_lb_hr ?? firstVals.load ?? 0);
  const loadBase = rawFirstLoad > 0 ? rawFirstLoad : 1;

  // Format chart data points from packets (indexed to 100 at first packet)
  const chartData = packets.map((pkt: any) => {
    const rawTime = pkt.timestamp_utc || pkt.timestamp;
    const timeStr = rawTime
      ? new Date(rawTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : `Seq #${pkt.seq}`;

    const vals = pkt.values || pkt.data?.values || pkt.data || pkt || {};
    const rawCo2 = vals.co2_mass_short_tons ?? vals.co2_mass ?? vals.co2;
    const rawHeat = vals.heat_input_mmbtu ?? vals.heat_input ?? vals.heat;
    const rawLoad = vals.gross_load_mw !== undefined && Number(vals.gross_load_mw) > 0
      ? Number(vals.gross_load_mw)
      : Number(vals.steam_load_1000_lb_hr ?? vals.load ?? 0);

    const co2Indexed =
      rawCo2 !== undefined && rawCo2 !== null && co2Base > 0
        ? Number(((Number(rawCo2) / co2Base) * 100).toFixed(2))
        : 100;

    const heatIndexed =
      rawHeat !== undefined && rawHeat !== null && heatBase > 0
        ? Number(((Number(rawHeat) / heatBase) * 100).toFixed(2))
        : 100;

    const loadIndexed =
      rawLoad !== undefined && rawLoad !== null && loadBase > 0
        ? Number(((Number(rawLoad) / loadBase) * 100).toFixed(2))
        : 100;

    return {
      seq: pkt.seq,
      label: `Seq #${pkt.seq}`,
      time: timeStr,
      co2_mass_short_tons: co2Indexed,
      heat_input_mmbtu: heatIndexed,
      gross_load_mw: loadIndexed,
      raw_co2: rawCo2,
      raw_heat: rawHeat,
      raw_load: rawLoad,
    };
  });

  // Separate O2 chart data points
  const o2ChartData = packets.map((pkt: any) => {
    const vals = pkt.values || pkt.data?.values || pkt.data || pkt || {};
    return {
      seq: pkt.seq,
      label: `Seq #${pkt.seq}`,
      o2_pct: vals.synthetic_stack_o2_pct ?? null,
    };
  });

  // Render pulsed dot for the latest point
  const renderPulsedDot = (props: any, color: string) => {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || isNaN(cx) || isNaN(cy)) return null;

    const latestSeq = chartData[chartData.length - 1]?.seq;
    const isLatest =
      payload?.seq !== undefined
        ? payload.seq === latestSeq
        : index === chartData.length - 1;

    if (!isLatest) {
      return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} />;
    }
    if (prefersReducedMotion) {
      return (
        <circle
          key={`dot-${index}`}
          cx={cx}
          cy={cy}
          r={5}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={2}
        />
      );
    }
    return (
      <g key={`dot-pulse-${index}`}>
        <circle
          cx={cx}
          cy={cy}
          r={7}
          fill={color}
          opacity={0.35}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className="animate-pulse-ring"
        >
          <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0.1;0.45" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      </g>
    );
  };

  const mainChannels = REGISTERED_CHANNELS.filter(
    (ch) => ch.key !== "synthetic_stack_o2_pct" && ch.key !== "synthetic_flue_temp_c" && ch.key !== "synthetic_stack_flow_kscfm"
  );

  return (
    <div
      role="region"
      aria-label="Live Telemetry Channels (Recharts)"
      className={`p-5 bg-surface border border-hairline rounded-card shadow-card space-y-5 ${className}`}
    >
      {/* Header and Channel Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <ChartIcon className="w-4 h-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-sm text-ink">
            Telemetry streams
          </h2>
        </div>

        {/* Tiny Dot Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-strong font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Real (CAMPD)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Synthetic</span>
          </span>
        </div>
      </div>

      {/* Channel Toggles with Explicit ON / OFF state */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Toggle telemetry channels">
        {mainChannels.map((ch) => {
          const isActive = activeChannels.includes(ch.key);
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => toggleChannel(ch.key)}
              aria-pressed={isActive}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-chip text-xs transition-all border ${
                isActive
                  ? "bg-surface-soft border-brand/60 text-ink font-bold shadow-sm ring-1 ring-brand/20"
                  : "bg-surface border-hairline text-muted-strong opacity-40 hover:opacity-75"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "" : "opacity-30"}`}
                style={{ backgroundColor: ch.color }}
              />
              <span className="font-mono text-xs">{ch.label}</span>
              <span
                className={`text-[10px] font-mono font-bold px-1 rounded ${
                  isActive ? "bg-brand/10 text-brand" : "text-muted"
                }`}
              >
                {isActive ? "ON" : "OFF"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Indexed Telemetry Chart */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-strong font-mono px-1">
          <span>CO₂ Mass & Heat Input</span>
          <span className="text-[11px] font-semibold text-brand">Index, start = 100</span>
        </div>

        <div className="h-72 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#5B6573"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              {/* Indexed Y Axis (start = 100) */}
              <YAxis
                stroke="#5B6573"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                domain={["auto", "auto"]}
                width={36}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0].payload;
                  return (
                    <div className="p-3 bg-surface border border-hairline rounded-card shadow-card text-xs space-y-1.5 min-w-[200px]">
                      <div className="flex items-center justify-between pb-1 mb-1 border-b border-hairline">
                        <span className="font-bold font-mono text-ink">{label}</span>
                        <span className="text-[10px] text-muted-strong">{pt.time}</span>
                      </div>
                      {payload.map((entry: any) => {
                        const cfg = REGISTERED_CHANNELS.find((c) => c.key === entry.dataKey);
                        if (!cfg) return null;
                        return (
                          <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: cfg.color }}
                              />
                              <span className="text-muted-strong">{cfg.label}:</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-ink">
                                {entry.value !== null && entry.value !== undefined
                                  ? `${Number(entry.value).toFixed(2)} (idx)`
                                  : "--"}
                              </span>
                              {entry.dataKey === "co2_mass_short_tons" && pt.raw_co2 !== undefined && (
                                <span className="text-[10px] font-mono text-muted-strong">
                                  ({Number(pt.raw_co2).toFixed(1)} T)
                                </span>
                              )}
                              {entry.dataKey === "heat_input_mmbtu" && pt.raw_heat !== undefined && (
                                <span className="text-[10px] font-mono text-muted-strong">
                                  ({Number(pt.raw_heat).toFixed(1)} mmBtu)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {mainChannels
                .filter((ch) => activeChannels.includes(ch.key))
                .map((ch) => (
                  <Line
                    key={ch.key}
                    type="monotone"
                    dataKey={ch.key}
                    name={ch.label}
                    stroke={ch.color}
                    strokeWidth={2}
                    dot={(props) => renderPulsedDot(props, ch.color)}
                    activeDot={{ r: 5, stroke: "#E5383B", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Small Standalone O₂ Chart with Units */}
      <div className="p-4 bg-surface-soft border border-hairline rounded-card space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 rounded-full h-2 bg-[#F59E0B]" />
            <span className="font-semibold text-ink">Flue gas O₂</span>
            <span className="text-[10px] text-muted-strong font-mono">(synthetic)</span>
          </div>
          <span className="font-mono text-xs text-muted-strong">% vol dry</span>
        </div>

        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={o2ChartData} margin={{ top: 5, right: 15, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#5B6573"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              <YAxis
                stroke="#5B6573"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const val = payload[0].value;
                  return (
                    <div className="p-2 bg-surface border border-hairline rounded-card shadow-sm text-xs font-mono">
                      <span>{label}: </span>
                      <span className="font-bold text-amber-600">
                        {val !== null && val !== undefined ? `${Number(val).toFixed(2)} %` : "--"}
                      </span>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="o2_pct"
                name="Flue Gas O₂"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={(props) => renderPulsedDot(props, "#F59E0B")}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
