"use client";
import {useState} from "react";
const occasions=[["🎂","День рождения"],["🎄","Новый год"],["❤️","Просто так"],["✨","Особенный день"]];
const designs=["Тёплые слова","С любовью","Сюрприз внутри","Праздничное настроение"];
export default function Home(){
 const [occasion,setOccasion]=useState("День рождения"),[design,setDesign]=useState(designs[0]),[recipient,setRecipient]=useState(""),[message,setMessage]=useState(""),[openAt,setOpenAt]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[link,setLink]=useState("");
 async function create(){
  setBusy(true);setError("");
  try{
   if(!recipient.trim()||!openAt||(!message.trim()&&!file))throw new Error("Укажите получателя, время и добавьте текст или изображение.");
   let imageUrl:string|undefined;
   if(file){const form=new FormData();form.append("file",file);const up=await fetch("/api/upload",{method:"POST",body:form});const u=await up.json();if(!up.ok)throw new Error(u.error||"Ошибка загрузки изображения");imageUrl=u.url;}
   const r=await fetch("/api/gifts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient,occasion,template:design,message,openAt:new Date(openAt).toISOString(),imageUrl})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось создать подарок");setLink(d.link);
  }catch(e){setError(e instanceof Error?e.message:"Ошибка создания");}finally{setBusy(false);}
 }
 return <main className="shell">
  <header className="topbar"><a className="brand" href="#"><span className="brand-mark">✳</span> подарки</a><a className="profile-link" href="#how">Как это работает ↗</a></header>
  <section className="hero"><div><div className="eyebrow">ПОДАРКИ, КОТОРЫЕ УМЕЮТ ЖДАТЬ</div><h1>Самое приятное<br/><em>ещё впереди.</em></h1><p className="hero-text">Отправьте человеку подарок, который откроется в выбранный вами день и час. Маленькое волшебство с точным временем.</p><a className="primary-link" href="#create">Создать подарок ↗</a><div className="hero-footnote">✦ На день рождения, Новый год или просто так</div></div><div className="hero-art"><div className="orbit"/><div className="orbit orbit-two"/><div className="spark spark-a">✦</div><div className="spark spark-b">✧</div><div className="gift-box"><div className="gift-lid"><i/></div><div className="gift-body"><b/></div><div className="gift-ribbon"/></div><div className="floating-note"><span>Откроется</span><strong>в нужный момент</strong></div></div></section>
  <section className="occasion-section"><div className="section-heading"><div><div className="eyebrow">ЛЮБОЙ ПОВОД</div><h2>Для важных моментов</h2></div></div><div className="occasion-grid">{occasions.map(([icon,name])=><button key={name} className={occasion===name?"occasion-card selected":"occasion-card"} onClick={()=>setOccasion(name)}><span className="occasion-icon">{icon}</span><strong>{name}</strong></button>)}</div></section>
  <section className="create-section" id="create"><div className="create-intro"><div className="eyebrow">ВАШ СЮРПРИЗ</div><h2>Создайте<br/><em>ожидание.</em></h2><p>Добавьте личные слова или изображение, выберите оформление и назначьте момент открытия.</p><div className="secure-note"><span>◷</span><div><strong>12 часов на открытие</strong><small>После назначенного времени подарок ждёт получателя ещё 12 часов.</small></div></div></div>
  <div className="form-card"><div className="form-title"><span>01 / НАСТРОЙКА</span><strong>Новый подарок</strong></div>
   <label>Кому предназначен подарок?<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Имя получателя"/></label>
   <label>Оформление<div className="template-row">{designs.map(x=><button type="button" key={x} className={design===x?"template active":"template"} onClick={()=>setDesign(x)}>{x}</button>)}</div></label>
   <label>Ваше поздравление<textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Напишите то, что хочется сказать..."/></label>
   <label>Своя картинка<div className="upload-box"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><span className="upload-symbol">＋</span><span>{file?file.name:"Выберите фотографию или изображение"}</span><small>до 5 МБ</small></div></label>
   <label>Дата и время открытия<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label>
   <button className="submit-button" disabled={busy} onClick={create}>{busy?"Создаём подарок…":"Создать подарок"} <span>→</span></button>
   {error&&<p className="form-error">{error}</p>}
   {link&&<div className="created-link"><strong>Подарок создан!</strong><p>Отправьте эту ссылку получателю в MAX.</p><div className="preview-meta link-value">{link}</div><button className="submit-button" onClick={()=>navigator.clipboard.writeText(link)}>Скопировать ссылку ↗</button></div>}
   <p className="form-disclaimer">Подарок будет закрыт до выбранного времени. После открытия его можно забрать в течение 12 часов.</p>
  </div></section>
  <section className="how-section" id="how"><div className="eyebrow">ВСЁ ПРОСТО</div><h2>Подарок в три шага</h2><div className="steps"><article><span>01</span><strong>Создайте</strong><p>Выберите повод, добавьте изображение и напишите свои слова.</p></article><article><span>02</span><strong>Назначьте время</strong><p>Решите, когда подарок станет доступен получателю.</p></article><article><span>03</span><strong>Поделитесь</strong><p>Перешлите ссылку в MAX. Получатель откроет сюрприз в нужный момент.</p></article></div></section>
  <footer><a className="brand" href="#"><span className="brand-mark">✳</span> подарки</a><span>Каждому моменту — свой сюрприз.</span><small>GIFT SERVICE</small></footer>
 </main>;
}