"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { haptic } from "@/components/telegram-init";

export function ReferralShare({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    haptic("light");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard недоступен в некоторых WebView — ссылка остаётся видимой
      // на экране, пользователь может выделить её вручную.
    }
  };

  const share = () => {
    haptic("medium");
    const text = "Выполняй простые задания и получай вознаграждение на карту или в USDT";
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-[11px] tracking-wide text-content-muted uppercase">
          Ваша ссылка
        </p>
        <p className="mt-1.5 truncate font-mono text-[12.5px] text-content-secondary">
          {link}
        </p>
        <p className="mt-1 text-[11px] text-content-muted">
          Код приглашения: <span className="font-mono font-semibold">{code}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Скопировано" : "Копировать"}
        </Button>
        <Button variant="primary" onClick={share}>
          <Share2 />
          Поделиться
        </Button>
      </div>
    </Card>
  );
}

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
              <stop offset="0%" stopColor="#ef7a7c" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#ef7a7c" stopOpacity={0} />
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
            stroke="#ef7a7c"
            strokeWidth={2}
            fill="url(#refGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
