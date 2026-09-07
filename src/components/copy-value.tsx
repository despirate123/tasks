"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/components/telegram-init";

export function CopyValue({
  label,
  value,
  hint,
  href,
  mono = true,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    haptic("light");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* WebView без буфера — значение видно на экране */
    }
  };

  return (
    <div className="rounded-2xl bg-surface-overlay p-3 ring-1 ring-inset ring-border-subtle">
      <p className="text-[11px] text-content-muted">{label}</p>
      <p
        className={cn(
          "mt-1 break-all text-[14px] font-semibold leading-snug",
          mono && "font-mono tracking-wide",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-content-muted">{hint}</p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-surface-raised px-3 py-1.5 text-[12.5px] font-medium text-content-primary ring-1 ring-inset ring-border-subtle"
        >
          {copied ? <Check className="size-3.5 text-brand-300" /> : <Copy className="size-3.5" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500/14 px-3 py-1.5 text-[12.5px] font-medium text-brand-300 ring-1 ring-inset ring-brand-500/28"
          >
            Открыть
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
