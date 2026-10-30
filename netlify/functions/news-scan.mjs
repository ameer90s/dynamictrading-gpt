import { getStore } from "@netlify/blobs";
import { recommendationWindow } from "./lib/time.mjs";
import { fetchPressReleases, summarizeCompositeNews, emptyNews } from "./lib/news.mjs";
import { fetchNews, alpacaConfigured } from "./lib/alpaca.mjs";
import { selectedUniverse } from "./lib/dynamic.mjs";
import { getShariaUniverse } from "./lib/sharia.mjs";
import { reserveApiMinute } from "./lib/credits.mjs";
import { getSmartWatch, smartWatchSymbols } from "./lib/smart-watch.mjs";

export default async () => {
  const clock=recommendationWindow();
  if(!clock.isTradingDay || clock.session!=="REGULAR" || clock.minuteOfDay<585 || clock.minuteOfDay>clock.endMinute) return new Response("Skipped: outside news window",{status:200});
  const tdKey=process.env.TWELVE_DATA_API_KEY;const alpacaOk=alpacaConfigured();if(!tdKey&&!alpacaOk)throw new Error("لا يوجد مزود أخبار مفعّل");
  const store=getStore("dynamic-trading");
  const discovery=await store.get(`dynamic-discovery-${clock.dateKey}`,{type:"json",consistency:"strong"});
  const sharia=await getShariaUniverse(store);
  const watch=await getSmartWatch(store,clock.dateKey);const watched=smartWatchSymbols(watch);const symbols=watched.length?watched:selectedUniverse(discovery,[]).slice(0,20);
  const primary=[];const alternatives=symbols;

  let alpacaArticles=[];let alpacaError=null;
  if(alpacaOk){try{alpacaArticles=await fetchNews(symbols,process.env.ALPACA_API_KEY_ID,process.env.ALPACA_API_SECRET_KEY,{hours:96,limit:50});}catch(e){alpacaError=e.message||"تعذر جلب الأخبار العامة";}}

  let pressMap={};let pressNote=null;
  if(tdKey){const pressSymbols=symbols.slice(0,6);const budget=await reserveApiMinute(store,"news-scan",pressSymbols.length);if(budget.allowed){const rows=await Promise.all(pressSymbols.map(async symbol=>{try{return [symbol,await fetchPressReleases(symbol,tdKey,3)];}catch{return [symbol,[]];}}));pressMap=Object.fromEntries(rows);}else pressNote="تم تخطي Press Releases هذه الدقيقة لتوفير Twelve Data credits.";}

  const bySymbol={};for(const symbol of symbols){try{bySymbol[symbol]=summarizeCompositeNews(symbol,pressMap[symbol]||[],alpacaArticles);}catch(e){bySymbol[symbol]={...emptyNews(symbol,e.message||"تعذر تحليل الأخبار"),status:"unavailable"};}}
  const payload={tradeDate:clock.dateKey,generatedAt:new Date().toISOString(),symbols,primary,alternatives,bySymbol,source:alpacaOk?"Alpaca/Benzinga + Twelve Data press releases":"Twelve Data press releases",providerStatus:{alpaca:alpacaOk&&!alpacaError?"ok":alpacaOk?"error":"not_configured",twelve:tdKey?"configured":"not_configured"},note:["الأخبار تشمل أعلى المرشحين الديناميكيين وتستخدم كفلتر مخاطر/اتجاه فقط.",alpacaError?`Alpaca: ${alpacaError}`:"",pressNote||""].filter(Boolean).join(" ")};
  await store.setJSON(`news-${clock.dateKey}`,payload);await store.setJSON("latest-news",payload);
  return new Response(`News cached for ${symbols.join(",")}`,{status:200});
};
