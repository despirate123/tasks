"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReferralShare({
  link,
  code,
  qrSvg,
  signupBonus,
}: {
  link: string;
  code: string;
  qrSvg: string;
  signupBonus?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
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
    const text = "Выполняй простые задания и получай вознаграждение на карту или в USDT";
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <Card className="space-y-3 p-4">
      <div
        className="mx-auto w-[11.5rem] overflow-hidden rounded-2xl bg-[#f4f5f6] p-2"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      {signupBonus ? (
        <p className="text-center text-[12.5px] leading-relaxed text-content-secondary">
          За первое оплаченное задание друга вы получите ещё {signupBonus} сверх
          процента.
        </p>
      ) : null}
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
