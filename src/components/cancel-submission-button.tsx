"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cancelSubmissionAction } from "@/server/actions";
import { haptic, hapticNotify } from "@/components/telegram-init";

export function CancelSubmissionButton({
  submissionId,
  className,
}: {
  submissionId: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        haptic("medium");
        startTransition(async () => {
          await cancelSubmissionAction(submissionId);
          hapticNotify("success");
        });
      }}
      className={cn(
        "text-[12.5px] font-medium text-content-muted underline-offset-2 hover:text-hard hover:underline disabled:opacity-50",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="inline size-3.5 animate-spin" />
      ) : confirming ? (
        "Точно отменить?"
      ) : (
        "Отменить задание"
      )}
    </button>
  );
}
