import { ShieldAlert } from "lucide-react";
import { SupportButton } from "@/components/support-button";
import { supportTelegramUrl } from "@/lib/support";

export function BlockedScreen({ reason }: { reason?: string | null }) {
  return (
    <div
      className="relative z-10 mx-auto flex min-h-[var(--tg-viewport-stable-height,100dvh)] max-w-[var(--app-max-width)] flex-col justify-center px-4"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "max(1rem, var(--safe-left))",
        paddingRight: "max(1rem, var(--safe-right))",
      }}
    >
      <div className="space-y-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-hard/12 text-hard ring-1 ring-inset ring-hard/25">
          <ShieldAlert className="size-6" />
        </div>
        <div>
          <h1 className="text-[22px] leading-tight font-bold">Аккаунт заблокирован</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-content-secondary">
            {reason?.trim() ||
              "Доступ к заданиям и выводу закрыт. Если это ошибка — напишите в поддержку."}
          </p>
        </div>
        <SupportButton href={supportTelegramUrl("Здравствуйте, мой аккаунт заблокирован")} />
      </div>
    </div>
  );
}

export function LimitedBanner({ reason }: { reason?: string | null }) {
  return (
    <div className="mb-3 rounded-2xl bg-medium/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-medium ring-1 ring-inset ring-medium/25">
      <p className="font-semibold">Аккаунт ограничен</p>
      <p className="mt-0.5 text-content-secondary">
        {reason?.trim() || "Новые задания недоступны. Вывести уже заработанное можно."}
      </p>
    </div>
  );
}
