"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cancelWithdrawalAction } from "@/server/actions";
import { haptic, hapticNotify } from "@/components/telegram-init";

export function CancelWithdrawalButton({
  id,
  label = "Отменить",
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        haptic("medium");
        startTransition(async () => {
          const result = await cancelWithdrawalAction(id);
          if (result.ok) hapticNotify("success");
          else hapticNotify("error");
          router.refresh();
        });
      }}
      className="text-[12px] font-medium text-content-muted underline-offset-2 hover:text-content-primary hover:underline disabled:opacity-50"
    >
      {pending ? <Loader2 className="inline size-3.5 animate-spin" /> : label}
    </button>
  );
}
