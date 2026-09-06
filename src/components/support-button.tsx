"use client";

import { Headset } from "lucide-react";
import { haptic, openTelegramLink } from "@/components/telegram-init";

export function SupportButton({ href }: { href: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("medium");
        openTelegramLink(href);
      }}
      className="group w-full text-left"
    >
      <div className="relative overflow-hidden rounded-card p-4 ring-1 ring-inset ring-support/30 transition-[transform,box-shadow] duration-300 ease-soft hover:-translate-y-px active:scale-[0.985]">
        <div
          aria-hidden
          className="glow-breathe pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-support/22 blur-3xl"
        />
        <div className="relative flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-support/16 text-support ring-1 ring-inset ring-support/35">
            <Headset className="size-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-[-0.015em] text-support">
              Поддержка
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-content-secondary">
              Вопросы по заданиям и выплатам
            </span>
          </span>
          <span className="inline-flex h-10 shrink-0 items-center rounded-2xl bg-support px-3.5 text-[13px] font-semibold text-[#0d1a20] transition-transform duration-300 ease-soft group-hover:scale-[1.03] group-active:scale-[0.98]">
            Написать
          </span>
        </div>
      </div>
    </button>
  );
}
