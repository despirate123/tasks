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
      <div className="relative overflow-hidden rounded-card p-4 ring-1 ring-inset ring-info/28 transition-[transform,box-shadow] duration-150 active:scale-[0.99]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-info/22 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-info/12 via-transparent to-transparent"
        />
        <div className="relative flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-info/16 text-info ring-1 ring-inset ring-info/30">
            <Headset className="size-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-[-0.015em] text-[#c9f0ff]">
              Поддержка
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-content-secondary">
              Вопросы по заданиям и выплатам
            </span>
          </span>
          <span className="inline-flex h-10 shrink-0 items-center rounded-2xl bg-[#7ad4ff] px-3.5 text-[13px] font-semibold text-[#041018] shadow-[0_8px_22px_-8px_rgba(122,212,255,0.8)] transition-transform group-active:scale-[0.98]">
            Написать
          </span>
        </div>
      </div>
    </button>
  );
}
