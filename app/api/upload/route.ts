import {NextRequest,NextResponse} from "next/server";
import {put} from "@vercel/blob";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  const form=await req.formData(),file=form.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"Файл не найден."},{status:400});
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))return NextResponse.json({error:"Поддерживаются JPG, PNG и WEBP."},{status:400});
  if(file.size>5*1024*1024)return NextResponse.json({error:"Максимальный размер изображения — 5 МБ."},{status:413});
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const result=await put(`gifts/${crypto.randomUUID()}.${ext}`,file,{access:"public",addRandomSuffix:false});
  return NextResponse.json({url:result.url});
 }catch(e){console.error("gift_upload_failed",e);return NextResponse.json({error:"Не удалось загрузить изображение. Проверьте Vercel Blob."},{status:500});}
}