/** Optional, bounded 15-minute Finnhub context. Not a trading or sharia signal. */
const safeSymbol=x=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
export async function fetchFinnhubContext38(symbols,{apiKey,fetchFn=fetch,now=new Date(),maxSymbols=12}={}){
 const unique=[...new Set((symbols||[]).map(s=>String(s||'').toUpperCase()).filter(safeSymbol))].slice(0,maxSymbols);
 if(!apiKey)return {status:'NOT_CONFIGURED',bySymbol:{},verifiedAt:null,requested:0};
 const today=now.toISOString().slice(0,10),from=new Date(now.getTime()-2*86400000).toISOString().slice(0,10);
 const bySymbol={},errors=[];
 // Single shared earnings-calendar call for the tracked set; no additional Netlify schedule.
 let earnings={status:'NOT_AVAILABLE',bySymbol:{}};
 try{const u=new URL('https://finnhub.io/api/v1/calendar/earnings');u.searchParams.set('from',today);u.searchParams.set('to',new Date(now.getTime()+14*86400000).toISOString().slice(0,10));const reply=await fetchFn(u.toString(),{headers:{'X-Finnhub-Token':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(2200)});if(!reply.ok)throw Error(`HTTP_${reply.status}`);const body=await reply.json();if(!Array.isArray(body.earningsCalendar))throw Error('EARNINGS_FORMAT');const allowed=new Set(unique);const rows={};for(const row of body.earningsCalendar){if(!allowed.has(row.symbol))continue;(rows[row.symbol]??=[]).push({date:String(row.date||'').slice(0,10),hour:String(row.hour||'').slice(0,12),epsEstimate:Number.isFinite(Number(row.epsEstimate))?Number(row.epsEstimate):null})};earnings={status:'LIVE',bySymbol:rows};}catch(e){earnings={status:'NOT_AVAILABLE',reason:String(e.message||'UNKNOWN').slice(0,60),bySymbol:{}}}

 for(let offset=0;offset<unique.length;offset+=4){
 const group=unique.slice(offset,offset+4);
 await Promise.all(group.map(async symbol=>{
  try{
   const url=new URL('https://finnhub.io/api/v1/company-news');url.searchParams.set('symbol',symbol);url.searchParams.set('from',from);url.searchParams.set('to',today);
   const response=await fetchFn(url.toString(),{headers:{'X-Finnhub-Token':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(2200)});
   if(!response.ok)throw Error(`HTTP_${response.status}`);
   const parsed=await response.json();if(!Array.isArray(parsed))throw Error('BAD_NEWS_FORMAT');
   bySymbol[symbol]={status:'LIVE',headlineCount:parsed.length,latest:parsed.slice(0,3).map(x=>({headline:String(x.headline||'').slice(0,150),source:String(x.source||'').slice(0,40),datetime:Number(x.datetime)||null})),verifiedAt:now.toISOString(),earnings:earnings.bySymbol[symbol]||[]};
  }catch(e){errors.push({symbol,reason:String(e.message||'UNKNOWN').slice(0,60)});}
 }));
 }
 return {status:errors.length?'DEGRADED':unique.length?'LIVE':'NO_SYMBOLS',earningsStatus:earnings.status,bySymbol,verifiedAt:Object.keys(bySymbol).length?now.toISOString():null,errors,requested:unique.length};
}
