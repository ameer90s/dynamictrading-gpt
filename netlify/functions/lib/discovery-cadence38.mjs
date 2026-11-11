/** V3.8 discovery throttling only. Minute SMART rechecks remain independent. */
export const DISCOVERY_INTERVAL_38=15;
export const FOCUS_TARGET_38=12;
export function isDiscoverySlot38(minuteOfDay,{marketOpenMinute=570,interval=DISCOVERY_INTERVAL_38}={}){
 return Number.isInteger(minuteOfDay)&&Number.isInteger(interval)&&interval>0&&minuteOfDay>=marketOpenMinute&&minuteOfDay<960&&(minuteOfDay-marketOpenMinute)%interval===0;
}
export function selectResearchFocus38(candidates=[],limit=FOCUS_TARGET_38){
 if(!Array.isArray(candidates))return [];
 const seen=new Set();return [...candidates].filter(x=>x&&typeof x.symbol==='string').sort((a,b)=>(Number(b.focusScore)||0)-(Number(a.focusScore)||0)).filter(x=>!seen.has(x.symbol)&&(seen.add(x.symbol),true)).slice(0,limit);
}

/** Deterministic 15-minute discovery that covers the eligible universe exactly
 * once per discovery window (normal 330m, half-day 150m), modulo retries.
 * The legacy discoveryBatches(pool, minute) must NOT be called every 15 min:
 * its minute-based stride can repeatedly scan the same small subset.
 */
export function cadencedDiscoveryBatches38(pool=[],minuteOfDay,{marketOpenMinute=570,discoveryCutoff=900,interval=DISCOVERY_INTERVAL_38,batchSize=8}={}){
 if(!Array.isArray(pool)||!isDiscoverySlot38(minuteOfDay,{marketOpenMinute,interval})||minuteOfDay>=discoveryCutoff||
    !Number.isInteger(discoveryCutoff)||discoveryCutoff<=marketOpenMinute)return [];
 const unique=[...new Set(pool.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().toUpperCase()))];
 if(!unique.length)return [];
 const slots=Math.ceil((discoveryCutoff-marketOpenMinute)/interval);
 const slot=Math.floor((minuteOfDay-marketOpenMinute)/interval);
 const perSlot=Math.ceil(unique.length/slots);
 const start=slot*perSlot;
 const picks=unique.slice(start,start+perSlot);
 const batches=[];
 for(let i=0;i<picks.length;i+=batchSize)batches.push(picks.slice(i,i+batchSize));
 return batches;
}
