/**
 * DT37: store only *completed earlier New York sessions* once a day per symbol.
 * Live session bars are fetched from Alpaca on EVERY analysis call, so there is
 * never a decision based on an unrefreshed intraday cache. Network failures
 * propagate; an unavailable Blob store falls back to the original full fetch.
 * The snapshot is an optimisation, not a source of trading truth.
 */
import {fetchIntradayBars,fetchIntradayBarsRange} from './alpaca.mjs';
import {newYorkParts} from './time.mjs';

export const PRIMARY_CACHE_SCHEMA='dt37-primary-history-1';
const DAYS=12, HISTORY_RECONCILE_MS=2*3600000;
// Strict parity: without provider revision tokens, a historical cache can differ.
// Keep source parity rather than silently using corrected historical prices.
// Only the other three Netlify processing optimisations remain enabled.
const STRICT_SOURCE_PARITY=true;
const toDay=(now)=>newYorkParts(now).dateKey;
const isBar=(x)=>x&&/^\d{4}-\d{2}-\d{2} \d\d:\d\d:00$/.test(x.datetime)&&
  [x.open,x.high,x.low,x.close].every(Number.isFinite)&&Number.isFinite(x.volume);
function valid(c,day,symbol){return c?.schema===PRIMARY_CACHE_SCHEMA&&c.day===day&&c.symbol===symbol&&
  c.feed==='ALPACA_IEX_RAW_1MIN'&&Array.isArray(c.history)&&c.history.every(x=>isBar(x)&&x.datetime.slice(0,10)<day)&&
  Number.isFinite(Date.parse(c.windowStart))&&Number.isFinite(Date.parse(c.savedAt));}
function uniqueSorted(rows){const map=new Map();for(const x of rows)map.set(x.datetime,x);
  return [...map.values()].sort((a,b)=>a.datetime.localeCompare(b.datetime));}
// 03:00 UTC precedes 00:00 America/New_York in EDT and EST. The small overlap
// is intentional: no after-midnight NY bar is omitted on either side of DST.
export function dayFetchStart37(day){return new Date(`${day}T03:00:00.000Z`);}
export function createPrimaryBarsLoader37(store,{nowFn=()=>new Date(),key=process.env.ALPACA_API_KEY_ID,secret=process.env.ALPACA_API_SECRET_KEY,
  fullFetch=fetchIntradayBars,rangeFetch=fetchIntradayBarsRange}={}){
 const inRun=new Map();
 return async (rawSymbol)=>{
  const symbol=String(rawSymbol||'').trim().toUpperCase();
  const now=nowFn();
  // Safety-first: refresh canonical historical bars until corrections can be detected.
  if(STRICT_SOURCE_PARITY)return fullFetch(symbol,key,secret,{lookbackDays:DAYS,now});
  const day=toDay(now);const desiredStart=new Date(now.getTime()-DAYS*86400e3);
  const cacheKey=`dt37-primary-history-${symbol}`; // rolling key: no daily Blob growth
  const runKey=`${day}-${symbol}`;
  let entry=inRun.get(runKey);
  if(!entry){
   entry=(async()=>{
    let cached=null;
    try{cached=await store.get(cacheKey,{type:'json',consistency:'strong'});}catch{/* full-fetch fallback */}
    if(valid(cached,day,symbol)&&Date.parse(cached.windowStart)<=desiredStart.getTime()&&
       now.getTime()>=Date.parse(cached.savedAt)&&now.getTime()-Date.parse(cached.savedAt)<HISTORY_RECONCILE_MS){
      return {history:cached.history,windowStart:cached.windowStart,full:null,fullAt:0};
    }
    const full=await fullFetch(symbol,key,secret,{lookbackDays:DAYS,now});
    if(!Array.isArray(full)||!full.every(isBar))throw Error(`INVALID_PRIMARY_BARS_${symbol}`);
    const history=full.filter(x=>x.datetime.slice(0,10)<day);
    const snapshot={schema:PRIMARY_CACHE_SCHEMA,day,symbol,feed:'ALPACA_IEX_RAW_1MIN',
      windowStart:desiredStart.toISOString(),savedAt:now.toISOString(),history};
    try{await store.setJSON(cacheKey,snapshot);}catch(e){console.warn('DT37_PRIMARY_CACHE_WRITE_FAILED',String(e?.message||e).slice(0,80));}
    return {history,windowStart:snapshot.windowStart,full,fullAt:now.getTime()};
   })();
   inRun.set(runKey,entry);
  }
  let data;
  try{data=await entry;}catch(e){inRun.delete(runKey);throw e;}
  // If the first response was fetched milliseconds ago, reuse its exact bars.
  // Thereafter ALWAYS request today's bars anew (no stale live decisions).
  if(data.full&&now.getTime()-data.fullAt>=0&&now.getTime()-data.fullAt<1000)return data.full;
  // In unusual cases (clock jumps, long-running process) the cached baseline
  // may start later than the requested 12-day window. Fail back to full data.
  if(Date.parse(data.windowStart)>desiredStart.getTime()){
    return fullFetch(symbol,key,secret,{lookbackDays:DAYS,now});
  }
  const live=await rangeFetch(symbol,key,secret,{start:dayFetchStart37(day),end:now});
  if(!Array.isArray(live)||!live.every(isBar))throw Error(`INVALID_LIVE_BARS_${symbol}`);
  const minNy=newYorkParts(desiredStart);const minKey=`${minNy.dateKey} ${String(minNy.hour).padStart(2,'0')}:${String(minNy.minute).padStart(2,'0')}:00`;
  return uniqueSorted([...data.history,...live]).filter(x=>x.datetime>=minKey);
 };
}
