"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
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
