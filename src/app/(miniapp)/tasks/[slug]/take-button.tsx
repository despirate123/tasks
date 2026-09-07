"use client";

import { useState, useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { takeOfferAction } from "@/server/actions";
import { hapticNotify } from "@/components/telegram-init";

export function TakeOfferButton({
  offerId,
  reward,
}: {
  offerId: string;
  reward: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      // При успехе действие делает redirect, поэтому сюда управление
      // возвращается только при отказе.
      const result = await takeOfferAction(offerId);
      if (result && !result.ok) {
        setError(result.error);
        hapticNotify("error");
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button
        variant="money"
        size="lg"
        block
        onClick={onClick}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Play className="fill-current" />
        )}
        Взять задание · {reward}
      </Button>
      {error ? (
        <p className="animate-fade-up text-center text-[12px] text-hard">{error}</p>
      ) : null}
    </div>
  );
}
