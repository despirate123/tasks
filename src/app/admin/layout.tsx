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
  if (!user || user.status === "BLOCKED" || !hasRole(user, "MODERATOR")) {
    redirect("/");
  }

  const gutter = {
    paddingLeft: "max(1rem, var(--safe-left))",
    paddingRight: "max(1rem, var(--safe-right))",
  } as const;

  return (
    <>
      <TelegramInit serverUserId={user.id} />
      <div className="admin-shell relative z-10 min-h-[100svh]">
        <header
          className="relative z-10 border-b border-border-subtle"
          style={{
            paddingTop: "var(--safe-top)",
            background: "#121212",
          }}
        >
          <div
            className="mx-auto flex max-w-6xl items-center gap-3 py-2.5"
            style={gutter}
          >
            <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/16 text-brand-300">
                <ShieldCheck className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] leading-tight font-bold">
                  <span className="sm:hidden">Admin</span>
                  <span className="hidden sm:inline">ProfiBux Admin</span>
                </span>
                <span className="block truncate text-[11px] text-content-muted">
                  {displayName(user)}
                  <span className="hidden min-[400px]:inline">
                    {" "}
                    · {USER_ROLE[user.role]}
                  </span>
                </span>
              </span>
            </Link>

            <Link
              href="/"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-raised px-3 py-2 text-[12.5px] font-medium text-content-secondary ring-1 ring-inset ring-border-subtle transition-[background,color] duration-300 ease-soft hover:bg-white/5 hover:text-content-primary"
            >
              <ArrowLeftRight className="size-3.5" />
              В прилу
            </Link>
          </div>

          <div className="mx-auto max-w-6xl" style={gutter}>
            <AdminNav />
          </div>
        </header>

        <main
          className="mx-auto max-w-6xl overflow-x-clip py-4 sm:py-5"
          style={{
            ...gutter,
            paddingBottom: "max(1.5rem, var(--safe-bottom))",
          }}
        >
          {children}
        </main>
      </div>
    </>
  );
}
