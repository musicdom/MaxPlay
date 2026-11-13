import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureSchema();
    const sql = db();
    const expired = await sql`UPDATE gifts SET status = 'expired' WHERE status IN ('scheduled','available') AND open_at + interval '12 hours' <= now() RETURNING id`;
    const available = await sql`UPDATE gifts SET status = 'available' WHERE status = 'scheduled' AND open_at <= now() AND open_at + interval '12 hours' > now() RETURNING id`;
    return NextResponse.json({ ok: true, expired: expired.length, available: available.length, processedAt: new Date().toISOString() });
  } catch (error) {
    console.error("gift_cron_failed", error);
    return NextResponse.json({ error: "Cron processing failed" }, { status: 500 });
  }
}