import { NextResponse } from "next/server";
import { db } from "@/server/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "up",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
