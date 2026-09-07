import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth";
import { listCategories } from "@/server/modules/offers";
import { OfferEditor } from "../offer-editor";

export default async function NewOfferPage() {
  await requireRole("ADMIN");
  const categories = await listCategories();

  return (
    <div className="motion-page space-y-5">
      <Link href="/admin/offers" className="back-nav">
        <ArrowLeft className="size-4" />
        Все офферы
      </Link>
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Новое задание</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          На старте задания заводите руками. Черновик не виден в Mini App, пока не
          нажмёте «Активен».
        </p>
      </div>
      <OfferEditor categories={categories} />
    </div>
  );
}
