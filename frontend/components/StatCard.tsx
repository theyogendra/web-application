"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

type Props = {
  label: string;
  value: string;
  delta?: number; // signed percentage; positive = good, negative = bad
  deltaSuffix?: string; // e.g. "vs last month"
  trend?: number[]; // sparkline data
  invertDelta?: boolean; // for metrics where DOWN is good (overdue, outstanding)
  accent?: "blue" | "green" | "amber" | "red" | "violet" | "neutral";
  icon?: React.ReactNode;
};

const ACCENTS: Record<
  NonNullable<Props["accent"]>,
  { stroke: string; fill: string }
> = {
  blue: { stroke: "#0A84FF", fill: "rgba(10,132,255,0.18)" },
  green: { stroke: "#34C759", fill: "rgba(52,199,89,0.18)" },
  amber: { stroke: "#FF9500", fill: "rgba(255,149,0,0.18)" },
  red: { stroke: "#FF3B30", fill: "rgba(255,59,48,0.18)" },
  violet: { stroke: "#AF52DE", fill: "rgba(175,82,222,0.18)" },
  neutral: { stroke: "#86868B", fill: "rgba(134,134,139,0.18)" },
};

export default function StatCard({
  label,
  value,
  delta,
  deltaSuffix = "vs last month",
  trend,
  invertDelta,
  accent = "blue",
  icon,
}: Props) {
  const colors = ACCENTS[accent];
  const hasDelta = typeof delta === "number" && isFinite(delta);
  // For "down is good" metrics (overdue, outstanding), flip the visual cue.
  const positive = hasDelta && (invertDelta ? delta! < 0 : delta! >= 0);
  const data = (trend && trend.length > 0 ? trend : [0, 0]).map((v, i) => ({
    i,
    v,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className="surface relative overflow-hidden rounded-2xl border border-[var(--separator-soft)] p-5 shadow-card transition-shadow hover:shadow-soft"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12.5px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="financial mt-2 text-[28px] font-semibold text-[var(--text-primary)]">
            {value}
          </p>
        </div>
        {icon ? (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: colors.fill, color: colors.stroke }}
          >
            {icon}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        {hasDelta ? (
          <span
            className={[
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-medium",
              positive
                ? "bg-[#34C759]/10 text-[#248A3D] dark:bg-[#30D158]/20 dark:text-[#30D158]"
                : "bg-[#FF3B30]/10 text-[#C20F0F] dark:bg-[#FF453A]/20 dark:text-[#FF453A]",
            ].join(" ")}
          >
            {positive ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {Math.abs(delta!).toFixed(1)}%
            <span className="ml-1 font-normal opacity-70">{deltaSuffix}</span>
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {deltaSuffix}
          </span>
        )}

        {trend && trend.length > 1 ? (
          <div className="h-10 w-[88px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`gradient-${accent}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={colors.stroke}
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="100%"
                      stopColor={colors.stroke}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={colors.stroke}
                  strokeWidth={1.5}
                  fill={`url(#gradient-${accent})`}
                  isAnimationActive
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
