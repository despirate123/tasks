"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { OfferAvatar } from "@/components/domain";
import { haptic } from "@/components/telegram-init";

export function ProfileAvatarButton({
  title,
  photoUrl,
}: {
  title: string;
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const openProfile = () => {
    if (leaving) return;
    haptic("medium");
    setLeaving(true);

    const go = () => router.push("/profile");
    if (typeof document.startViewTransition === "function") {
      void document.startViewTransition(go);
      return;
    }
    window.setTimeout(go, 280);
  };

  return (
    <button
      type="button"
      onClick={openProfile}
      aria-label="Открыть профиль"
      className={cn(
        "relative shrink-0 rounded-full outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "ring-2 ring-[var(--acid)]/40 ring-offset-2 ring-offset-black",
        "focus-visible:ring-[var(--acid)] active:scale-90",
        leaving && "scale-[0.35] opacity-0 blur-sm",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-full bg-[var(--acid)]/18 blur-md"
      />
      <span className="relative block [view-transition-name:profile-avatar]">
        <OfferAvatar title={title} iconUrl={photoUrl} size="md" shape="circle" />
      </span>
    </button>
  );
}
