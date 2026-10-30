import { alpacaConfigured } from './alpaca.mjs';

function fmtDate(d){return d.toISOString().slice(0,10);}
function nyString(iso){
  const d=new Date(iso);const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:00`;
}
export function historicalPeriod(months=6){
  const end=new Date();end.setUTCDate(end.getUTCDate()-1);end.setUTCHours(23,59,59,0);
  const start=new Date(end);start.setUTCMonth(start.getUTCMonth()-Math.max(3,Math.min(12,Number(months)||6)));
  return {start,end,startDate:fmtDate(start),endDate:fmtDate(end),months:Math.max(3,Math.min(12,Number(months)||6))};
}
export async function fetchHistoricalBundle(symbol,tdKey,{months=6}={}){
  const period=historicalPeriod(months);
  if(alpacaConfigured()){
    const [stock,spy,qqq]=await Promise.all([''+symbol,'SPY','QQQ'].map(s=>fetchAlpacaBars(s,process.env.ALPACA_API_KEY_ID,process.env.ALPACA_API_SECRET_KEY,period.start,period.end)));
    return {stock,spy,qqq,provider:'Alpaca IEX historical 5Min',period,estimatedTwelveCredits:0};
  }
  if(!tdKey)throw new Error('TWELVE_DATA_API_KEY غير مضاف');
  if(period.months>6)throw new Error('Backtest لمدة 9–12 شهراً يحتاج مفاتيح Alpaca لتجنب تجاوز Twelve Data credits. بدون Alpaca استخدم 3 أو 6 أشهر.');
  const windows=period.months<=3?[[period.start,period.end]]:splitTwoWindows(period.start,period.end);
  const load=async s=>{const chunks=[];for(const [a,b] of windows)chunks.push(await fetchTwelveRange(s,tdKey,a,b));return dedupe(chunks.flat());};
  const [stock,spy,qqq]=await Promise.all([load(symbol),load('SPY'),load('QQQ')]);
  return {stock,spy,qqq,provider:`Twelve Data historical 5min (${windows.length} date window${windows.length>1?'s':''})`,period,estimatedTwelveCredits:windows.length*3};
}
function splitTwoWindows(start,end){const mid=new Date((start.getTime()+end.getTime())/2);return [[start,mid],[new Date(mid.getTime()+60000),end]];}
async function fetchTwelveRange(symbol,key,start,end){
  const url=new URL('https://api.twelvedata.com/time_series');url.searchParams.set('symbol',symbol);url.searchParams.set('interval','5min');url.searchParams.set('start_date',fmtDate(start));url.searchParams.set('end_date',fmtDate(end));url.searchParams.set('timezone','America/New_York');url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
  const r=await fetch(url,{headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok||d.status==='error'||d.code)throw new Error(`${symbol}: ${d.message||`HTTP ${r.status}`}`);if(!Array.isArray(d.values))return [];
  return d.values.map(o=>({datetime:o.datetime,open:Number(o.open),high:Number(o.high),low:Number(o.low),close:Number(o.close),volume:Number(o.volume||0)})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));
}
async function fetchAlpacaBars(symbol,key,secret,start,end){
  const out=[];let token=null;let guard=0;
  do{
    const url=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);url.searchParams.set('timeframe','5Min');url.searchParams.set('start',start.toISOString());url.searchParams.set('end',end.toISOString());url.searchParams.set('adjustment','raw');url.searchParams.set('feed','iex');url.searchParams.set('sort','asc');url.searchParams.set('limit','10000');if(token)url.searchParams.set('page_token',token);
    const r=await fetch(url,{headers:{Accept:'application/json','APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${symbol}: ${d.message||`Alpaca HTTP ${r.status}`}`);
    for(const b of (d.bars||[]))out.push({datetime:nyString(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v||0)});
    token=d.next_page_token||null;guard++;
  }while(token&&guard<20);
  return dedupe(out);
}
function dedupe(rows){const m=new Map();for(const x of rows)m.set(x.datetime,x);return [...m.values()].sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));}
