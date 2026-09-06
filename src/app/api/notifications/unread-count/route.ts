import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getUnreadCount } from "@/server/modules/notifications";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });

  const count = await getUnreadCount(user.id);
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
