import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";
function botLink(id: string) { return process.env.MAX_BOT_USERNAME ? `https://max.ru/${process.env.MAX_BOT_USERNAME}?start=gift_${id}` : null; }
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  await ensureSchema(); const {id}=await params; const key=req.nextUrl.searchParams.get("key")||""; const sql=db();
  const rows=await sql`SELECT id,recipient_name,occasion,template,message,image_url,open_at,status,claimed_at FROM gifts WHERE id=${id} AND access_key=${key} LIMIT 1`;
  if(!rows.length)return NextResponse.json({error:"Подарок не найден."},{status:404});
  const g=rows[0] as Record<string,any>, now=Date.now(), opens=new Date(g.open_at).getTime();
  if(g.status!=="claimed"&&now>=opens+12*60*60*1000){await sql`UPDATE gifts SET status='expired' WHERE id=${id} AND status<>'claimed'`;return NextResponse.json({status:"expired"});}
  if(now<opens)return NextResponse.json({status:"locked",recipient:g.recipient_name,openAt:g.open_at,botLink:botLink(id)});
  if(g.status==="expired")return NextResponse.json({status:"expired"});
  return NextResponse.json({status:g.status==="claimed"?"claimed":"available",botLink:botLink(id),gift:{id:g.id,recipient:g.recipient_name,occasion:g.occasion,template:g.template,message:g.message,imageUrl:g.image_url,openAt:g.open_at,claimedAt:g.claimed_at}});
 } catch(e){console.error("gift_read_failed",e);return NextResponse.json({error:"Ошибка сервера."},{status:500});}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  await ensureSchema();const {id}=await params;const {key}=await req.json();const sql=db();
  const rows=await sql`SELECT open_at,status FROM gifts WHERE id=${id} AND access_key=${String(key||"")} LIMIT 1`;
  if(!rows.length)return NextResponse.json({error:"Подарок не найден."},{status:404});
  const g=rows[0] as {open_at:string;status:string},now=Date.now(),opens=new Date(g.open_at).getTime();
  if(now<opens)return NextResponse.json({error:"Подарок ещё закрыт."},{status:403});
  if(now>=opens+12*60*60*1000||g.status==="expired"){await sql`UPDATE gifts SET status='expired' WHERE id=${id} AND status<>'claimed'`;return NextResponse.json({error:"Время на открытие подарка истекло."},{status:410});}
  await sql`UPDATE gifts SET status='claimed',claimed_at=now() WHERE id=${id} AND status IN ('scheduled','available')`;
  return NextResponse.json({ok:true,status:"claimed"});
 }catch(e){console.error("gift_claim_failed",e);return NextResponse.json({error:"Ошибка сервера."},{status:500});}
}