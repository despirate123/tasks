import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, ShieldCheck } from "lucide-react";
import { displayName, getCurrentUser, hasRole } from "@/server/auth";
import { USER_ROLE } from "@/lib/labels";
import { TelegramInit } from "@/components/telegram-init";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "MODERATOR")) redirect("/");

  return (
    <>
      <TelegramInit />
      <div className="relative z-10 min-h-dvh">
        <header
          className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base/88 backdrop-blur-xl"
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500/16 text-brand-300">
                <ShieldCheck className="size-[18px]" />
              </span>
              <span>
                <span className="block text-[14px] leading-tight font-bold">
                  ProfiBux Admin
                </span>
                <span className="block text-[11px] text-content-muted">
                  {displayName(user)} · {USER_ROLE[user.role]}
                </span>
              </span>
            </Link>

            <AdminNav />

            <Link
              href="/"
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-surface-raised px-3 py-2 text-[12.5px] font-medium text-content-secondary ring-1 ring-inset ring-border-subtle transition hover:text-content-primary"
            >
              <ArrowLeftRight className="size-3.5" />
              <span className="hidden sm:inline">В приложение</span>
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-5 pb-20">{children}</main>
      </div>
    </>
  );
}
