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
      className="relative z-20 block shrink-0 rounded-full outline-none ring-2 ring-[var(--acid)]/40 ring-offset-2 ring-offset-[var(--canvas)] transition-transform duration-300 ease-soft active:scale-90 focus-visible:ring-[var(--acid)]"
    >
      <span className="relative block">
        <OfferAvatar title={title} iconUrl={photoUrl} size="md" shape="circle" />
      </span>
    </Link>
  );
}
