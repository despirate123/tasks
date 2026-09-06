import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser, displayName, hasRole } from "@/server/auth";
import { getUnreadCount } from "@/server/modules/notifications";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { TelegramInit } from "@/components/telegram-init";
import { OfferAvatar } from "@/components/domain";

export const dynamic = "force-dynamic";

export default async function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const unread = user ? await getUnreadCount(user.id) : 0;
  const isStaff = user ? hasRole(user, "MODERATOR") : false;

  return (
    <>
      <TelegramInit serverUserId={user?.id ?? null} />
      <div className="relative z-10 mx-auto flex min-h-[var(--tg-viewport-stable-height,100dvh)] max-w-[var(--app-max-width)] flex-col">
        <header
          className="sticky top-0 z-40 border-b border-border-subtle/70 bg-surface-base/85 backdrop-blur-xl"
          style={{
            paddingTop: "var(--safe-top)",
            paddingLeft: "max(1rem, var(--safe-left))",
            paddingRight: "max(1rem, var(--safe-right))",
          }}
        >
          <div className="flex items-center gap-3 py-3">
            <Link href="/profile" className="flex min-w-0 items-center gap-2.5">
              <OfferAvatar
                title={user ? displayName(user) : "PB"}
                iconUrl={user?.photoUrl}
                size="sm"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] leading-tight font-semibold">
                  {user ? displayName(user) : "ProfiBux"}
                </span>
                <span className="block text-[11px] text-content-muted">
                  {user ? "Профиль и баланс" : "Задания за вознаграждение"}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              {isStaff ? (
                <Link
                  href="/admin"
                  aria-label="Админ-панель"
                  className="flex size-10 items-center justify-center rounded-xl bg-surface-raised/80 ring-1 ring-inset ring-border-subtle transition active:scale-95"
                >
                  <ShieldCheck className="size-[18px] text-content-secondary" />
                </Link>
              ) : null}
              <NotificationBell initialCount={unread} />
            </div>
          </div>
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
