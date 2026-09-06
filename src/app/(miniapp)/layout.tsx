import { getCurrentUser } from "@/server/auth";
import { BottomNav } from "@/components/bottom-nav";
import { TabTransition } from "@/components/tab-transition";
import { TelegramInit } from "@/components/telegram-init";

export const dynamic = "force-dynamic";

export default async function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const demoBypass = process.env.DEV_AUTH_BYPASS === "true";

  return (
    <>
      <TelegramInit serverUserId={user?.id ?? null} />
      <div
        className="relative z-10 mx-auto flex min-h-[var(--tg-viewport-stable-height,100dvh)] max-w-[var(--app-max-width)] flex-col overflow-x-hidden"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        {demoBypass ? (
          <div className="bg-medium px-3 py-2 text-center text-[12px] font-semibold text-black">
            Демо-режим: показан Алексей. В .env поставь DEV_AUTH_BYPASS=false и
            перезапусти npm run start
          </div>
        ) : null}

        <main
          className="flex-1 px-4 pt-4"
          style={{
            paddingBottom: "calc(var(--nav-height) + 1rem)",
            paddingLeft: "max(1rem, var(--safe-left))",
            paddingRight: "max(1rem, var(--safe-right))",
          }}
        >
          <TabTransition>{children}</TabTransition>
        </main>

        <BottomNav />
      </div>
    </>
  );
}
