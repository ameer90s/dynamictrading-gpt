/** Memoize immutable completed PRIOR sessions to avoid up to 30 Blob reads
 * on each AI scan minute. Short TTL makes late archive corrections visible.
 * An incomplete read is not saved as a valid cache. */
export const AI_HISTORY_SCHEMA='dt37-ai-closed-history-1';
export async function getPriorAiHistory37(store,{day,index,now=new Date(),ttlMs=5*60000}={}){
 const days=(index?.days||[]).filter(x=>x!==day).slice(0,30);
 const marker=days.join('|');
 const key='dt37-ai-prior-history-latest'; // rolling key (day/marker validated)
 let prev;
 try{prev=await store.get(key,{type:'json',consistency:'strong'});}catch{prev=null;}
 if(prev?.schema===AI_HISTORY_SCHEMA&&prev?.day===day&&prev?.marker===marker&&Array.isArray(prev?.historical)&&
    Number.isFinite(Date.parse(prev?.computedAt))&&now.getTime()>=Date.parse(prev.computedAt)&&
    now.getTime()-Date.parse(prev.computedAt)<ttlMs)return prev.historical;
 let complete=true;
 const sessions=await Promise.all(days.map(async d=>{
   try{return await store.get(`ai-parallel-state-${d}`,{type:'json',consistency:'strong'});}catch{complete=false;return null;}
 }));
 const historical=sessions.filter(Boolean).flatMap(x=>x.closedOutcomes||[]).filter(x=>x?.closedAt&&x?.netUsd!=null);
 // No cache for missing/error days, even if previous logic silently skipped them.
 if(complete&&sessions.every(Boolean)){
   try{await store.setJSON(key,{schema:AI_HISTORY_SCHEMA,day,marker,historical,computedAt:now.toISOString()});}
   catch(e){console.warn('DT37_HISTORY_CACHE_WRITE_FAILED',String(e?.message||e).slice(0,80));}
 }
 return historical;
}
