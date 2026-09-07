"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil } from "lucide-react";
import { duplicateOfferAction } from "@/server/actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function OfferOps({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" asChild>
        <Link href={`/admin/offers/${offerId}/edit`}>
          <Pencil className="size-3.5" />
          Содержание
        </Link>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await duplicateOfferAction(offerId);
            if (result.ok && result.offerId) {
              router.push(`/admin/offers/${result.offerId}/edit`);
            }
          })
        }
      >
        <Copy className="size-3.5" />
        Копия
      </Button>
    </div>
  );
}
