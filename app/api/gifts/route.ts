import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { db, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const recipient = String(body.recipient || "").trim().slice(0, 100);
    const occasion = String(body.occasion || "Просто так").slice(0, 60);
    const template = String(body.template || "Тёплые слова").slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 3000);
    const imageUrl = body.imageUrl ? String(body.imageUrl).slice(0, 2048) : null;
    const openAt = new Date(body.openAt);
    if (!recipient || !body.openAt || Number.isNaN(openAt.getTime()) || openAt.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: "Укажите имя получателя и время открытия минимум через минуту." }, { status: 400 });
    }
    if (!message && !imageUrl) return NextResponse.json({ error: "Добавьте текст или изображение." }, { status: 400 });
    await ensureSchema();
    const id = randomUUID();
    const accessKey = randomBytes(24).toString("hex");
    const senderToken = randomBytes(24).toString("hex");
    const sql = db();
    await sql`INSERT INTO gifts (id, access_key, sender_token, recipient_name, occasion, template, message, image_url, open_at)
      VALUES (${id}, ${accessKey}, ${senderToken}, ${recipient}, ${occasion}, ${template}, ${message}, ${imageUrl}, ${openAt.toISOString()})`;
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.json({ id, link: `${base}/gift/${id}?key=${accessKey}`, senderToken, status: "scheduled" }, { status: 201 });
  } catch (error) {
    console.error("gift_create_failed", error);
    return NextResponse.json({ error: "Не удалось создать подарок. Проверьте настройки сервера." }, { status: 500 });
  }
}