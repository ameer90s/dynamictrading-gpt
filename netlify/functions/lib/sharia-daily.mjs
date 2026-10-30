// Dynamic Trading 3.5 — daily zero-credit Sharia refresh.
// Public AAOIFI dataset: HalalWallet. Never replaces a valid master with empty/bad data.
export const DAILY_SHARIA_KEY='sharia-daily-halalwallet-v451';
export const DAILY_SHARIA_AUDIT_KEY='sharia-daily-audit-v451';
export const HALALWALLET_URL='https://www.halalwallet.us/api/data/halal-stock-screening-data-us.json';
const US_EXCHANGES=new Set(['NYSE','NASDAQ']);
const cleanSymbol=s=>String(s||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
export function normalizeHalalWallet(payload={}){
  const rows=Array.isArray(payload?.records)?payload.records:[];
  const accepted=rows.filter(r=>String(r?.entityType||'').toLowerCase()==='stock' && String(r?.verdict||'').toLowerCase()==='halal' && String(r?.basis||'').toUpperCase()==='AAOIFI' && US_EXCHANGES.has(String(r?.exchange||'').toUpperCase()));
  const symbols=[...new Set(accepted.map(r=>cleanSymbol(r?.ticker)).filter(Boolean))].sort();
  const generatedAt=payload?._meta?.generatedAt||payload?._meta?.summary?.asOf||null;
  return {symbols,source:'HALALWALLET_PUBLIC_DATASET',sourceUrl:HALALWALLET_URL,methodology:'AAOIFI',fetchedAt:new Date().toISOString(),sourceUpdatedAt:generatedAt,count:symbols.length};
}
export function diffSymbols(previous=[],next=[]){
  const a=new Set(previous),b=new Set(next);return{added:[...b].filter(x=>!a.has(x)).sort(),removed:[...a].filter(x=>!b.has(x)).sort(),unchanged:[...b].filter(x=>a.has(x)).length};
}
export async function refreshDailySharia(store,{fetchImpl=fetch,now=new Date(),minSymbols=50}={}){
  const previous=await store.get(DAILY_SHARIA_KEY,{type:'json',consistency:'strong'}).catch(()=>null);
  try{
    const r=await fetchImpl(HALALWALLET_URL,{headers:{Accept:'application/json','User-Agent':'Dynamic-Trading-3.5'},signal:AbortSignal.timeout(15000)});
    if(!r?.ok)throw new Error(`HalalWallet HTTP ${r?.status}`);
    const next=normalizeHalalWallet(await r.json());
    if(next.symbols.length<minSymbols)throw new Error(`HalalWallet validation failed: only ${next.symbols.length} eligible symbols`);
    next.fetchedAt=now.toISOString();
    const changes=diffSymbols(previous?.symbols||[],next.symbols);
    const saved={...next,schemaVersion:'3.5',changes};
    await store.setJSON(DAILY_SHARIA_KEY,saved);
    await store.setJSON(DAILY_SHARIA_AUDIT_KEY,{at:now.toISOString(),status:'SUCCESS',count:saved.count,sourceUpdatedAt:saved.sourceUpdatedAt,added:changes.added,removed:changes.removed});
    return {...saved,cacheStatus:'DAILY_REFRESHED'};
  }catch(error){
    await store.setJSON(DAILY_SHARIA_AUDIT_KEY,{at:now.toISOString(),status:'FAILED',error:String(error?.message||error),preservedCount:previous?.symbols?.length||0}).catch(()=>{});
    if(previous?.symbols?.length)return {...previous,cacheStatus:'DAILY_STALE_FALLBACK',refreshError:String(error?.message||error)};
    return {symbols:[],count:0,source:'HALALWALLET_PUBLIC_DATASET',methodology:'AAOIFI',cacheStatus:'DAILY_UNAVAILABLE',refreshError:String(error?.message||error)};
  }
}
export async function loadDailySharia(store){
  const x=await store.get(DAILY_SHARIA_KEY,{type:'json',consistency:'strong'}).catch(()=>null);return x?.symbols?.length?x:null;
}
