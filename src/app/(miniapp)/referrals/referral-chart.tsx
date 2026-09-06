"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function EarningsChart({
  data,
}: {
  data: { date: string; amount: number }[];
}) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="refGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f7f16a" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#f7f16a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "#64708a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(data.length / 4)}
          />
          <YAxis
            tick={{ fill: "#64708a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "#1a2336",
              border: "1px solid #2d3a55",
              borderRadius: 12,
              fontSize: 12,
              color: "#f1f5fb",
            }}
            formatter={(value) => [`${Number(value).toLocaleString("ru-RU")} ₽`, "Заработок"]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#f7f16a"
            strokeWidth={2}
            fill="url(#refGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
