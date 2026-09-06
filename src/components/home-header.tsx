import { displayName, getCurrentUser } from "@/server/auth";
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

  return (
    <header className="relative z-20">
      <div className="flex items-center gap-3 pb-3">
        <ProfileAvatarButton
          title={user ? displayName(user) : "PB"}
          photoUrl={user?.photoUrl}
        />

        <div className="ml-auto">
          <NotificationBell initialCount={unread} />
        </div>
      </div>
      <PromoBannerRail banners={banners} />
    </header>
  );
}
