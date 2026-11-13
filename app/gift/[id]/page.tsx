"use client";
import {useEffect,useState} from "react";
import {useParams,useSearchParams} from "next/navigation";
type Gift={recipient:string;occasion:string;template:string;message:string;imageUrl?:string|null;openAt:string};
type GiftState={status:string;recipient?:string;openAt?:string;botLink?:string|null;gift?:Gift};
export default function GiftPage(){
 const params=useParams<{id:string}>(),search=useSearchParams(),key=search.get("key")||"";
 const [data,setData]=useState<GiftState|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch(`/api/gifts/${params.id}?key=${encodeURIComponent(key)}`,{cache:"no-store"});const j=await r.json();if(!r.ok)setError(j.error||"Подарок не найден");else{setError("");setData(j)}}
 useEffect(()=>{load()},[params.id,key]);
 async function claim(){setBusy(true);const r=await fetch(`/api/gifts/${params.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key})});const j=await r.json();setBusy(false);if(!r.ok)setError(j.error);else load()}
 return <main className="gift-page"><a className="brand" href="/"><span className="brand-mark">✳</span> подарки</a><div className="gift-page-card">
 {error?<><div className="preview-gift">✧</div><h1>{error}</h1></>:!data?<p>Загружаем подарок…</p>:data.status==="locked"?<><div className="preview-gift">🎁</div><div className="eyebrow">ЭТО СЮРПРИЗ</div><h1>Подарок для {data.recipient}</h1><p>Он пока закрыт. Возвращайтесь в назначенное время.</p><div className="preview-meta">{data.openAt?new Date(data.openAt).toLocaleString("ru-RU"):""}</div>{data.botLink&&<a className="submit-button" href={data.botLink}>Подключить уведомление в MAX ↗</a>}</>:data.status==="expired"?<><div className="preview-gift">⌛</div><h1>Подарок сгорел</h1><p>12 часов на открытие закончились. Этот сюрприз больше недоступен.</p></>:data.status==="available"?<><div className="preview-gift">🎁</div><div className="eyebrow">ВАШ СЮРПРИЗ</div><h1>Подарок уже можно открыть</h1><p>Откройте его сейчас — у вас есть 12 часов с назначенного времени.</p><button className="submit-button" disabled={busy} onClick={claim}>{busy?"Открываем…":"Открыть подарок"} <span>→</span></button>{data.botLink&&<a className="bot-reminder" href={data.botLink}>Получать сообщения от бота MAX</a>}</>:data.status==="claimed"&&data.gift?<><div className="preview-gift">🎁</div><div className="eyebrow">ПОДАРОК ОТКРЫТ</div><h1>Для {data.gift.recipient}</h1><p className="gift-message">{data.gift.message}</p>{data.gift.imageUrl&&<img className="gift-image" src={data.gift.imageUrl} alt="Изображение подарка"/>}<div className="preview-meta">{data.gift.occasion} · {data.gift.template}</div><p>Этот подарок сохранён у вас.</p></>:null}
 </div></main>;
}