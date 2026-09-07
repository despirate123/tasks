import { NextResponse } from "next/server";
import { listActiveBanners } from "@/server/modules/banners";

export const dynamic = "force-dynamic";

export async function GET() {
  const banners = await listActiveBanners();
  return NextResponse.json(banners, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
