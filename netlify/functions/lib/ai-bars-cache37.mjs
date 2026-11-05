/**
 * DT37 AI scanner: incremental 1-minute Alpaca bars with bounded overlap.
 * Every invocation still fetches LIVE Alpaca bars and quotes; old cached
 * observations can never substitute for a failed live network request.
 * Persist a checkpoint per symbol every 10 minutes, limiting Blob writes.
 */
import {newYorkParts} from './time.mjs';
export const AI_BAR_CACHE_SCHEMA='dt37-ai-minute-bars-1';
const HOUR=3600000, OVERLAP_MS=30*60000, CHECKPOINT_MINUTES=10, RECONCILE_MINUTES=30;
const dayOf=(now)=>newYorkParts(now).dateKey;
function validBar(x,day){return x&&typeof x.datetime==='string'&&x.datetime.startsWith(day)&&
  [x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&x.high>=x.low&&x.low>0;}
function valid(c,day,symbol,now){return c?.schema===AI_BAR_CACHE_SCHEMA&&c.day===day&&c.symbol===symbol&&
  Number.isFinite(Date.parse(c.throughAt))&&Date.parse(c.throughAt)<=now.getTime()&&
  Array.isArray(c.bars)&&c.bars.every(x=>validBar(x,day))&&
  Number.isInteger(c.checkpointBucket)&&Number.isFinite(Date.parse(c.lastReconciledAt));}
function nyDateTime(now){const p=newYorkParts(now);return `${p.dateKey} ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}:00`;}
function merge(rows,updates){const map=new Map();for(const x of [...rows,...updates])map.set(x.datetime,x);
  return [...map.values()].sort((a,b)=>a.datetime.localeCompare(b.datetime));}
export function createAiBarsCache37(store,{fetchBars,env=process.env}={}){
 if(typeof fetchBars!=='function')throw Error('AI_BAR_TRANSPORT_REQUIRED');
 const memory=new Map();
 return async (rawSymbol,now=new Date())=>{
  const symbol=String(rawSymbol||'').trim().toUpperCase(),day=dayOf(now),id=`${day}-${symbol}`;
  const key=`dt37-ai-incremental-${symbol}`; // rolling key, avoids unbounded daily storage
  let cached=memory.get(id);
  if(!cached){
    try{cached=await store.get(key,{type:'json',consistency:'strong'});}catch{cached=null;}
  }
  if(!valid(cached,day,symbol,now))cached=null;
  // Read overlaps 30 minutes to pick up revised bars and late prints.
  // On a cold instance, use the unchanged full lookback transport.
  const needsFull=!cached||Math.floor(now.getTime()/(RECONCILE_MINUTES*60000))!==
    Math.floor(Date.parse(cached.lastReconciledAt)/(RECONCILE_MINUTES*60000));
  const requestedStart=needsFull ? now.getTime()-12*HOUR :
    Math.max(now.getTime()-12*HOUR,Date.parse(cached.throughAt)-OVERLAP_MS);
  // Align delta start to 1Min boundary so an overlap replacement cannot
  // accidentally drop the first cached bar while querying a partial minute.
  const start=new Date(needsFull?requestedStart:Math.floor(requestedStart/60000)*60000);
  const fresh=await fetchBars(symbol,now,env,{start}); // throws on feed failure: no stale return
  if(!Array.isArray(fresh)||!fresh.every(x=>validBar(x,day)))throw Error(`AI_BARS_INVALID_${symbol}`);
  // A reconciliation is an authoritative full-day snapshot. Between them,
  // replace (not retain) the overlapped portion: removed/revised bars in the
  // provider feed cannot survive indefinitely in our local history.
  const untouched=needsFull?[]:(cached?.bars||[]).filter(x=>x.datetime<nyDateTime(start));
  const bars=merge(untouched,fresh);
  const bucket=Math.floor(now.getTime()/(CHECKPOINT_MINUTES*60000));
  const checkpoint={schema:AI_BAR_CACHE_SCHEMA,day,symbol,throughAt:now.toISOString(),checkpointBucket:bucket,bars,
    lastReconciledAt:needsFull?now.toISOString():cached.lastReconciledAt};
  memory.set(id,checkpoint);
  // Avoid building a perpetual symbol cache during long-lived warm instances.
  if(memory.size>350){for(const k of memory.keys()){if(!k.startsWith(day+'-'))memory.delete(k);}if(memory.size>350)memory.delete(memory.keys().next().value);}
  if(!cached||cached.checkpointBucket!==bucket){
    try{await store.setJSON(key,checkpoint);}catch(e){console.warn('DT37_AI_CACHE_WRITE_FAILED',String(e?.message||e).slice(0,80));}
  }
  return bars;
 };
}
