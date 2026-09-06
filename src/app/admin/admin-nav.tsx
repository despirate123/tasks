"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  LayoutDashboard,
  Megaphone,
  Package,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true },
  { href: "/admin/moderation", label: "Модерация", icon: ShieldCheck },
  { href: "/admin/offers", label: "Офферы", icon: Package },
  { href: "/admin/payouts", label: "Выплаты", icon: Banknote },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/banners", label: "Баннеры", icon: Megaphone },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 no-scrollbar">
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-[background,color,transform] duration-300 ease-soft active:scale-[0.97]",
              active
                ? "bg-brand-500/14 text-brand-300"
                : "text-content-secondary hover:bg-surface-raised hover:text-content-primary",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden md:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
