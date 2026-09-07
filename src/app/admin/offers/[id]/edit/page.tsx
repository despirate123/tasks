import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { requireRole } from "@/server/auth";
import { listCategories } from "@/server/modules/offers";
import { OfferEditor, type OfferEditorValues } from "../../offer-editor";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const [offer, categories] = await Promise.all([
    db.offer.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    listCategories(),
  ]);
  if (!offer) notFound();

  const initial: OfferEditorValues = {
    title: offer.title,
    subtitle: offer.subtitle ?? "",
    brandName: offer.brandName ?? "",
    description: offer.description,
    iconUrl: offer.iconUrl ?? "",
    categoryId: offer.categoryId ?? "",
    rewardAmount: String(Number(offer.rewardAmount)),
    holdHours: String(offer.holdHours),
    difficulty: offer.difficulty,
    approvalEtaMinutes: String(offer.approvalEtaMinutes),
    requirePhoto: offer.requirePhoto,
    requireVideo: offer.requireVideo,
    requireComment: offer.requireComment,
    minPhotos: String(offer.minPhotos),
    maxPhotos: String(offer.maxPhotos),
    proofHint: offer.proofHint ?? "",
    completionTtlMins: String(offer.completionTtlMins),
    perUserLimit: String(offer.perUserLimit),
    totalLimit: offer.totalLimit != null ? String(offer.totalLimit) : "",
    dailyLimit: offer.dailyLimit != null ? String(offer.dailyLimit) : "",
    newUsersOnly: offer.newUsersOnly,
    trackingUrl: offer.trackingUrl ?? "",
    promoCode: offer.promoCode ?? "",
    isFeatured: offer.isFeatured,
    isHot: offer.isHot,
    publishNow: false,
    steps:
      offer.steps.length > 0
        ? offer.steps.map((step) => ({
            title: step.title,
            description: step.description ?? "",
          }))
        : [{ title: "", description: "" }],
  };

  return (
    <div className="motion-page space-y-5">
      <Link href={`/admin/offers/${offer.id}`} className="back-nav">
        <ArrowLeft className="size-4" />
        К заданию
      </Link>
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Редактировать задание</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Ссылка в каталоге не меняется. Статус публикации — на странице задания.
        </p>
      </div>
      <OfferEditor offerId={offer.id} categories={categories} initial={initial} />
    </div>
  );
}
