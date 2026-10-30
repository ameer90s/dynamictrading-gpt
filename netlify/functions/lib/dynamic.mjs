// Dynamic Trading v3.5 — Sharia-first, full-universe dynamic discovery.
// No fixed scanner universe. Every verified Sharia symbol is retained in the pool.
export const SHARIA_BLOCKED_SYMBOLS = new Set(); // Sharia eligibility comes only from the verified master universe.
export const PRICE_CAP = 200;
export const DISCOVERY_BATCH_SIZE = 8;

function cleanList(input=[]){
  const raw=Array.isArray(input)?input:String(input||"").split(",");
  return [...new Set(raw.map((x)=>String(x).trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,"")).filter(Boolean))]
    .filter((s)=>!SHARIA_BLOCKED_SYMBOLS.has(s));
}
export function normalizePool(input = []) { return cleanList(input); }
export function normalizePrimary(input=[], allowedPool=[]){ const allowed=new Set(normalizePool(allowedPool)); return cleanList(input).filter(s=>allowed.has(s)).slice(0,5); }
export function expandedSearchPool(primary=[], allowedPool=[]){ const base=normalizePool(allowedPool); return normalizePool([...normalizePrimary(primary,base),...base]); }
export function priceBucket(price){const px=Number(price||0);return px<5?'0-4.99':px<10?'5-9.99':'10-200';}

// One deterministic batch per minute. Across the regular-session scan window this
// cycles through the complete eligible universe and wraps only after full coverage.
export function discoveryBatch(poolInput, minuteOfDay = 570, batchSize=DISCOVERY_BATCH_SIZE) {
  const pool=normalizePool(poolInput); if(!pool.length)return [];
  const size=Math.max(1,Math.floor(Number(batchSize)||DISCOVERY_BATCH_SIZE));
  const batchIndex=Math.max(0,Math.floor(Number(minuteOfDay)||570)-570);
  const start=(batchIndex*size)%pool.length; const out=[];
  for(let i=0;i<Math.min(size,pool.length);i++)out.push(pool[(start+i)%pool.length]);
  return out;
}

export function discoveryBatches(poolInput, minuteOfDay=570, totalScanMinutes=10){
  const pool=normalizePool(poolInput);if(!pool.length)return [];
  const perMinute=Math.max(1,Math.ceil(pool.length/(Math.max(1,totalScanMinutes)*DISCOVERY_BATCH_SIZE)));
  const minuteIndex=Math.max(0,Math.floor(Number(minuteOfDay)||570)-570);const batches=[];
  for(let b=0;b<perMinute;b++){const start=((minuteIndex*perMinute+b)*DISCOVERY_BATCH_SIZE)%pool.length;const batch=[];for(let i=0;i<Math.min(DISCOVERY_BATCH_SIZE,pool.length);i++)batch.push(pool[(start+i)%pool.length]);batches.push(batch);}
  return batches;
}
export function mergeDiscovery(previous=null,analysis=null,minuteOfDay=570,sessionEligibleSymbols=[],attemptedBatch=[]){
 const eligibleSet=new Set(normalizePool(sessionEligibleSymbols));
 const attempted=new Set([...(previous?.attemptedSymbols||[]),...normalizePool(attemptedBatch)]);
 const successfulNow=normalizePool(analysis?.scanHealth?analysis.scanHealth.successfulSymbols:attemptedBatch).filter(s=>s!=='SPY'&&s!=='QQQ');
 const failedNow=normalizePool(analysis?.scanHealth?.failedSymbols||[]).filter(s=>s!=='SPY'&&s!=='QQQ');
 const successful=new Set([...(previous?.successfulSymbols||[]),...successfulNow]);
 const failed=new Set([...(previous?.failedSymbols||[]),...failedNow]); for(const s of successful)failed.delete(s);
 const map=new Map(); for(const row of previous?.leaders||[])map.set(row.symbol,row);
 for(const r of analysis?.all||[]){const rv=+r.metrics?.relativeVolume||0,liq=+r.metrics?.liquidityScore||0,mtf=+r.metrics?.mtfAlignment||0,rs=Math.abs(+r.metrics?.relativeStrengthPct||0),atr=+r.metrics?.atrPct||0,inp=+r.inPlayScore||0,mv=Math.abs(+r.metrics?.sessionChangePct||0),boost=r.metrics?.setupFamily&&r.metrics.setupFamily!=="BREAKOUT_RETEST"?5:0;const score=clamp(inp*.29+Math.min(100,rv*50)*.20+liq*.16+mtf*.11+Math.min(100,rs*140)*.08+Math.min(100,atr*65)*.07+Math.min(100,mv*40)*.05+(+r.confidence||0)*.04+boost);const prior=map.get(r.symbol);const px=+r.price||0;const sessionEligible=eligibleSet.size?eligibleSet.has(r.symbol):(prior?.sessionEligible===true||(px>0&&px<=PRICE_CAP));map.set(r.symbol,{symbol:r.symbol,score:Math.round(score),inPlayScore:Math.round(inp),rvol:rv,liquidityScore:Math.round(liq),mtf:Math.round(mtf),relativeStrengthPct:+r.metrics?.relativeStrengthPct||0,atrPct:atr,sessionChangePct:+r.metrics?.sessionChangePct||0,confidence:+r.confidence||0,setupFamily:r.metrics?.setupFamily||null,price:px,priceBucket:priceBucket(px),sessionStartPrice:prior?.sessionStartPrice??null,sessionStartBand:prior?.sessionStartBand??null,sessionEligible,eligibleAtScan:px>0&&px<=PRICE_CAP,watchPriceExceptionEligible:sessionEligible,watchPriceExceptionSince:prior?.watchPriceExceptionSince||(sessionEligible?(analysis?.generatedAt||new Date().toISOString()):null),scannedAt:analysis?.generatedAt||new Date().toISOString(),scanMinuteNY:minuteOfDay});}
 const leaders=[...map.values()].sort((a,b)=>b.score-a.score);const eligibleCount=eligibleSet.size||normalizePool(sessionEligibleSymbols).length;return{generatedAt:new Date().toISOString(),lastSuccessfulScanAt:successfulNow.length?(analysis?.generatedAt||new Date().toISOString()):(previous?.lastSuccessfulScanAt||null),lastScanMinuteNY:minuteOfDay,attemptedSymbols:[...attempted],successfulSymbols:[...successful],failedSymbols:[...failed],scannedSymbols:successful.size,attemptedCount:attempted.size,successfulCount:successful.size,failedCount:failed.size,coveragePct:eligibleCount?Number((successful.size/eligibleCount*100).toFixed(2)):100,analyzedSymbols:leaders.length,leaders};
}
export function selectedUniverse(discovery,fallback=[]){const leaders=Array.isArray(discovery?.leaders)?discovery.leaders:[];const ranked=leaders.filter(x=>x.sessionEligible===true||x.watchPriceExceptionEligible===true).sort((a,b)=>b.score-a.score).map(x=>x.symbol);return ranked.length?ranked:normalizePool(fallback);}
export function alternativeCandidates(discovery,primaryInput=[],max=3,allowedPool=[]){const allowed=new Set(normalizePool(allowedPool)),primary=normalizePrimary(primaryInput,allowedPool),used=new Set(primary),out=[];const leaders=Array.isArray(discovery?.leaders)?[...discovery.leaders].sort((a,b)=>(+b.score||0)-(+a.score||0)):[];for(const row of leaders){const s=String(row.symbol||'').toUpperCase();if(!s||used.has(s)||!allowed.has(s)||SHARIA_BLOCKED_SYMBOLS.has(s)||row.sessionEligible!==true)continue;out.push(s);used.add(s);if(out.length>=max)return out;}for(const s of normalizePool(allowedPool)){if(used.has(s))continue;out.push(s);used.add(s);if(out.length>=max)break;}return out;}
export function priceBandFunnel(rows=[]){const out={'0-4.99':0,'5-9.99':0,'10-200':0};for(const r of rows){if(r?.sessionEligible!==true)continue;out[r.sessionStartBand||priceBucket(r.sessionStartPrice||r.price)]++;}return out;}
function clamp(v){return Math.max(0,Math.min(100,+v||0));}
