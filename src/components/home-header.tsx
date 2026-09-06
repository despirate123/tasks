import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { displayName, getCurrentUser, hasRole } from "@/server/auth";
import { listActiveBanners } from "@/server/modules/banners";
import { getUnreadCount } from "@/server/modules/notifications";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileAvatarButton } from "@/components/profile-avatar-button";
import { PromoBannerRail } from "@/components/promo-banner";

export async function HomeHeader() {
  const user = await getCurrentUser();
  const [unread, banners] = await Promise.all([
    user ? getUnreadCount(user.id) : Promise.resolve(0),
    listActiveBanners(),
  ]);
  const isStaff = user ? hasRole(user, "MODERATOR") : false;

  return (
    <header className="relative z-20">
      <div className="flex items-center gap-3 pb-3">
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
  );
}
