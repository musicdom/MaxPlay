import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const { id } = await params;
    const key = req.nextUrl.searchParams.get("key") || "";
    const sql = db();
    const rows = await sql`SELECT id, access_key, recipient_name, occasion, template, message, image_url, open_at, status, claimed_at
      FROM gifts WHERE id = ${id} AND access_key = ${key} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "Подарок не найден." }, { status: 404 });
    const gift = rows[0] as Record<string, any>;
    const now = Date.now();
    const opens = new Date(gift.open_at).getTime();
    if (gift.status !== "claimed" && now >= opens + 12 * 60 * 60 * 1000) {
      await sql`UPDATE gifts SET status = 'expired' WHERE id = ${id} AND status <> 'claimed'`;
      return NextResponse.json({ status: "expired" });
    }
    if (now < opens) return NextResponse.json({ status: "locked", recipient: gift.recipient_name, openAt: gift.open_at });
    if (gift.status === "expired") return NextResponse.json({ status: "expired" });
    return NextResponse.json({ status: gift.status === "claimed" ? "claimed" : "available", gift: {
      id: gift.id, recipient: gift.recipient_name, occasion: gift.occasion, template: gift.template,
      message: gift.message, imageUrl: gift.image_url, openAt: gift.open_at, claimedAt: gift.claimed_at
    }});
  } catch (error) {
    console.error("gift_read_failed", error);
    return NextResponse.json({ error: "Ошибка сервера." }, { status: 500 });
  }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const { id } = await params;
    const { key } = await req.json();
    const sql = db();
    const rows = await sql`SELECT open_at, status FROM gifts WHERE id = ${id} AND access_key = ${String(key || "")} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "Подарок не найден." }, { status: 404 });
    const gift = rows[0] as { open_at: string; status: string };
    const now = Date.now(), opens = new Date(gift.open_at).getTime();
    if (now < opens) return NextResponse.json({ error: "Подарок ещё закрыт." }, { status: 403 });
    if (now >= opens + 12 * 60 * 60 * 1000 || gift.status === "expired") {
      await sql`UPDATE gifts SET status = 'expired' WHERE id = ${id} AND status <> 'claimed'`;
      return NextResponse.json({ error: "Время на открытие подарка истекло." }, { status: 410 });
    }
    await sql`UPDATE gifts SET status = 'claimed', claimed_at = now() WHERE id = ${id} AND status IN ('scheduled','available')`;
    return NextResponse.json({ ok: true, status: "claimed" });
  } catch (error) {
    console.error("gift_claim_failed", error);
    return NextResponse.json({ error: "Ошибка сервера." }, { status: 500 });
  }
}