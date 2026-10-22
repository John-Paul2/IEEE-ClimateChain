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
import type { TelemetryPacket } from "../types/telemetry";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export interface ChannelConfig {
  key: string;
  label: string;
  unit: string;
  source: "REAL" | "SYNTHETIC";
  color: string;
  yAxisId: "left" | "right";
}

export const REGISTERED_CHANNELS: ChannelConfig[] = [
  {
    key: "co2_mass_short_tons",
    label: "CO₂ Mass Flow",
    unit: "short T/hr",
    source: "REAL",
    color: "#2DD4BF", // Teal
    yAxisId: "left",
  },
  {
    key: "gross_load_mw",
    label: "Gross Generation Load",
    unit: "MW",
    source: "REAL",
    color: "#38BDF8", // Sky Blue
    yAxisId: "right",
  },
  {
    key: "heat_input_mmbtu",
    label: "Heat Input",
    unit: "mmBtu/hr",
    source: "REAL",
    color: "#A78BFA", // Violet
    yAxisId: "right",
  },
  {
    key: "synthetic_stack_o2_pct",
    label: "Flue Gas O₂",
    unit: "% vol dry",
    source: "SYNTHETIC",
    color: "#F59E0B", // Amber
    yAxisId: "left",
  },
  {
    key: "synthetic_flue_temp_c",
    label: "Flue Gas Temp",
    unit: "°C",
    source: "SYNTHETIC",
    color: "#F43F5E", // Rose
    yAxisId: "right",
  },
  {
    key: "synthetic_stack_flow_kscfm",
    label: "Stack Flow Rate",
    unit: "kscfm",
    source: "SYNTHETIC",
    color: "#34D399", // Emerald
    yAxisId: "right",
  },
];

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
  // Selected channel keys
  const [activeChannels, setActiveChannels] = useState<string[]>([
    "co2_mass_short_tons",
    "gross_load_mw",
    "heat_input_mmbtu",
    "synthetic_stack_o2_pct",
  ]);

  const toggleChannel = (key: string) => {
    setActiveChannels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (isLoading) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-surface border border-border rounded-xl ${className}`}>
        <ErrorState title="Telemetry Charts Error" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty || packets.length === 0) {
    return (
      <div className={`p-5 bg-surface border border-border rounded-xl ${className}`}>
        <EmptyState
          icon={ChartIcon}
          title="No telemetry data recorded"
          description="Live Recharts will display sensor streams once packets arrive from CEMS edge gateway."
        />
      </div>
    );
  }

  // Format chart data points from packets
  const chartData = packets.map((pkt) => {
    const timeStr = pkt.timestamp_utc
      ? new Date(pkt.timestamp_utc).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : `Seq #${pkt.seq}`;

    const pt: Record<string, any> = {
      seq: pkt.seq,
      label: `Seq #${pkt.seq}`,
      time: timeStr,
    };

    for (const ch of REGISTERED_CHANNELS) {
      pt[ch.key] = pkt.values?.[ch.key] ?? null;
    }

    return pt;
  });

  return (
    <div
      role="region"
      aria-label="Live Telemetry Channels (Recharts)"
      className={`p-5 bg-surface border border-border rounded-xl shadow-sm space-y-4 ${className}`}
    >
      {/* Header and Channel Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <ChartIcon className="w-5 h-5 text-info" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-text">
              Real-Time Stack Telemetry Multi-Chart
            </h3>
            <p className="text-xs text-muted">
              Live Recharts visualization across {packets.length} sealed packets (US EPA CAMPD & synthetic channels)
            </p>
          </div>
        </div>

        {/* Real vs Synthetic Summary Badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-verified/10 text-verified border border-verified/30">
            <span className="w-2 h-2 rounded-full bg-verified" />
            REAL (EPA CAMPD)
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
            <span className="w-2 h-2 rounded-full bg-warning" />
            SYNTHETIC (Simulated)
          </span>
        </div>
      </div>

      {/* Channel Toggles with Explicit REAL or SYNTHETIC Label */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Toggle telemetry channels">
        {REGISTERED_CHANNELS.map((ch) => {
          const isActive = activeChannels.includes(ch.key);
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => toggleChannel(ch.key)}
              aria-pressed={isActive}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isActive
                  ? "bg-surface-raised border-info/50 text-text shadow-sm"
                  : "bg-surface-sunken border-border text-muted hover:text-text hover:border-border/80 opacity-60"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: ch.color }}
              />
              <span className="font-mono text-xs">{ch.label}</span>
              <span
                className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded border ${
                  ch.source === "REAL"
                    ? "bg-verified/15 text-verified border-verified/40"
                    : "bg-warning/15 text-warning border-warning/40"
                }`}
              >
                {ch.source}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Recharts Area */}
      <div className="h-80 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 25, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#8FA0BF"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#1F2A44" }}
            />
            {/* Left Y Axis for CO2 / O2 */}
            <YAxis
              yAxisId="left"
              stroke="#8FA0BF"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#1F2A44" }}
              domain={["auto", "auto"]}
            />
            {/* Right Y Axis for MW / Heat / Temp / Flow */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#8FA0BF"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#1F2A44" }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const pt = payload[0].payload;
                return (
                  <div className="p-3 bg-surface border border-border rounded-lg shadow-xl text-xs space-y-1.5 min-w-[200px]">
                    <div className="flex items-center justify-between pb-1 mb-1 border-b border-border/60">
                      <span className="font-bold font-mono text-text">{label}</span>
                      <span className="text-[10px] text-muted">{pt.time}</span>
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
                            <span className="text-muted">{cfg.label}:</span>
                            <span
                              className={`text-[9px] font-mono px-1 rounded ${
                                cfg.source === "REAL"
                                  ? "bg-verified/20 text-verified"
                                  : "bg-warning/20 text-warning"
                              }`}
                            >
                              {cfg.source}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-text">
                            {entry.value !== null && entry.value !== undefined
                              ? `${Number(entry.value).toFixed(2)} ${cfg.unit}`
                              : "--"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {REGISTERED_CHANNELS.filter((ch) => activeChannels.includes(ch.key)).map((ch) => (
              <Line
                key={ch.key}
                type="monotone"
                dataKey={ch.key}
                name={`${ch.label} [${ch.source}]`}
                stroke={ch.color}
                yAxisId={ch.yAxisId}
                strokeWidth={2}
                dot={{ r: 3, fill: ch.color }}
                activeDot={{ r: 5, stroke: "#0B1220", strokeWidth: 2 }}
                isAnimationActive={true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
