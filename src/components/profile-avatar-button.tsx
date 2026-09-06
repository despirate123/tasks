"use client";

import Link from "next/link";
import { OfferAvatar } from "@/components/domain";
import { haptic } from "@/components/telegram-init";

export function ProfileAvatarButton({
  title,
  photoUrl,
}: {
  title: string;
  photoUrl?: string | null;
}) {
  return (
    <Link
      href="/profile"
      aria-label="Открыть профиль"
      onClick={() => haptic("medium")}
      className="relative z-20 block shrink-0 rounded-full outline-none ring-2 ring-[var(--acid)]/40 ring-offset-2 ring-offset-black transition-transform duration-200 ease-out active:scale-90 focus-visible:ring-[var(--acid)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-full bg-[var(--acid)]/18 blur-md"
      />
      <span className="relative block">
        <OfferAvatar title={title} iconUrl={photoUrl} size="md" shape="circle" />
      </span>
    </Link>
  );
}
