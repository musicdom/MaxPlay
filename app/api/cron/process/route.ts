import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
export const runtime="nodejs";
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;if(secret&&req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  await ensureSchema();const sql=db();
  const expired=await sql`UPDATE gifts SET status='expired' WHERE status IN ('scheduled','available') AND open_at+interval '12 hours'<=now() RETURNING id`;
  const available=await sql`UPDATE gifts SET status='available' WHERE status='scheduled' AND open_at<=now() AND open_at+interval '12 hours'>now() RETURNING id`;
  let notified=0;
  if(process.env.MAX_BOT_TOKEN&&process.env.NEXT_PUBLIC_APP_URL){
   const due=await sql`SELECT id,access_key,recipient_user_id FROM gifts WHERE status='available' AND recipient_user_id IS NOT NULL AND bot_notified_at IS NULL AND open_at<=now() AND open_at+interval '12 hours'>now() LIMIT 100`;
   for(const gift of due as Array<{id:string;access_key:string;recipient_user_id:string}>){
    const url=`${process.env.NEXT_PUBLIC_APP_URL}/gift/${gift.id}?key=${gift.access_key}`;
    const response=await fetch(`https://platform-api.max.ru/messages?user_id=${gift.recipient_user_id}`,{method:"POST",headers:{Authorization:process.env.MAX_BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({text:"🎁 Ваш подарок уже можно открыть! У вас есть 12 часов, чтобы забрать его.",attachments:[{type:"inline_keyboard",payload:{buttons:[[{type:"link",text:"Открыть подарок",url}]]}}]})});
    if(response.ok){await sql`UPDATE gifts SET bot_notified_at=now() WHERE id=${gift.id} AND bot_notified_at IS NULL`;notified++;}
   }
  }
  return NextResponse.json({ok:true,expired:expired.length,available:available.length,notified,processedAt:new Date().toISOString()});
 }catch(e){console.error("gift_cron_failed",e);return NextResponse.json({error:"Cron processing failed"},{status:500});}
}