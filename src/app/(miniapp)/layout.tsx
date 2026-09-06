import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser, displayName, hasRole } from "@/server/auth";
import { listActiveBanners } from "@/server/modules/banners";
import { getUnreadCount } from "@/server/modules/notifications";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileAvatarButton } from "@/components/profile-avatar-button";
import { PromoBannerRail } from "@/components/promo-banner";
import { TelegramInit } from "@/components/telegram-init";

export const dynamic = "force-dynamic";

export default async function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const [unread, banners] = await Promise.all([
    user ? getUnreadCount(user.id) : Promise.resolve(0),
    listActiveBanners(),
  ]);
  const isStaff = user ? hasRole(user, "MODERATOR") : false;
  const demoBypass = process.env.DEV_AUTH_BYPASS === "true";

  return (
    <>
      <TelegramInit serverUserId={user?.id ?? null} />
      <div className="relative z-10 mx-auto flex min-h-[var(--tg-viewport-stable-height,100dvh)] max-w-[var(--app-max-width)] flex-col">
        {demoBypass ? (
          <div className="bg-medium px-3 py-2 text-center text-[12px] font-semibold text-black">
            Демо-режим: показан Алексей. В .env поставь DEV_AUTH_BYPASS=false и
            перезапусти npm run start
          </div>
        ) : null}
        <header
          className="sticky top-0 z-40 glass-thin"
          style={{
            paddingTop: "var(--safe-top)",
            paddingLeft: "max(1rem, var(--safe-left))",
            paddingRight: "max(1rem, var(--safe-right))",
          }}
        >
          <div className="flex items-center gap-3 py-3">
            <ProfileAvatarButton
              title={user ? displayName(user) : "PB"}
              photoUrl={user?.photoUrl}
            />

            <div className="ml-auto flex items-center gap-2">
              {isStaff ? (
                <Link
                  href="/admin"
                  aria-label="Админ-панель"
                  className="flex size-10 items-center justify-center rounded-full glass-thin ring-1 ring-inset ring-white/12 transition active:scale-95"
                >
                  <ShieldCheck className="size-[18px] text-content-secondary" />
                </Link>
              ) : null}
              <NotificationBell initialCount={unread} />
            </div>
          </div>
          <PromoBannerRail banners={banners} />
        </header>

        <main
          className="flex-1 px-4 pt-4"
          style={{
            paddingBottom: "calc(var(--nav-height) + 1rem)",
            paddingLeft: "max(1rem, var(--safe-left))",
            paddingRight: "max(1rem, var(--safe-right))",
          }}
        >
          {children}
        </main>

        <BottomNav />
      </div>
    </>
  );
}
