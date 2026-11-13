import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    if (update.update_type === "bot_started" && update.user?.user_id && update.payload) {
      const giftId = String(update.payload).replace(/^gift_/, "");
      if (/^[0-9a-f-]{36}$/i.test(giftId)) {
        await ensureSchema();
        const sql = db();
        await sql`UPDATE gifts SET recipient_user_id = ${String(update.user.user_id)} WHERE id = ${giftId} AND status IN ('scheduled','available') AND recipient_user_id IS NULL`;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("max_webhook_failed", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}