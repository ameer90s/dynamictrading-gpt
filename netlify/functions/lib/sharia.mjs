// Dynamic Trading 3.5 — zero-credit Sharia master universe with optional refresh.
// Live source: Halal Terminal. Refresh at most every 48h; cache last successful AAOIFI-compliant list.
const CACHE_KEY = 'sharia-universe-v35';
const REFRESH_MS = 48 * 60 * 60 * 1000;
const BASE = 'https://api.halalterminal.com';
import {loadLocalShariaDatabase} from './sharia-local.mjs';
import {bundledShariaUniverse} from './sharia-bundled.mjs';
import {loadDailySharia} from './sharia-daily.mjs';
// The bundled list is verified source data supplied for this deployment, not a trading watchlist or privileged symbol list.

const clean = (xs=[]) => [...new Set(xs.map(x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'')).filter(Boolean))];
const isCompliant = (row) => {
  const by = row?.methodologies || row?.by_methodology || row?.byMethodology || {};
  const a = by?.AAOIFI?.status || by?.AAOIFI || by?.aaoifi?.status || by?.aaoifi;
  const overall = row?.overall_status || row?.overallStatus || row?.status || row?.compliance_status;
  return String(a || overall || '').toUpperCase() === 'COMPLIANT';
};
const symbolOf = (row) => row?.symbol || row?.ticker || row?.asset?.symbol || row?.stock?.symbol || '';
function rowsFrom(payload){
  if(Array.isArray(payload)) return payload;
  for(const k of ['results','data','items','stocks','screenings']) if(Array.isArray(payload?.[k])) return payload[k];
  return [];
}

export async function getShariaUniverse(store, { force=false }={}){
  const cached = await store.get(CACHE_KEY,{type:'json',consistency:'strong'}).catch(()=>null);
  const age = cached?.fetchedAt ? Date.now()-Date.parse(cached.fetchedAt) : Infinity;

  // First choice: latest validated daily public AAOIFI refresh (zero credits).
  const daily=await loadDailySharia(store);
  if(daily?.symbols?.length) return {...daily,cacheStatus:'DAILY_PUBLIC_MASTER'};

  // First choice: verified local AAOIFI database. No external API and no credits.
  const local=await loadLocalShariaDatabase(store);
  if(local?.isFresh) return {...local,cacheStatus:'LOCAL_DATABASE_FRESH'};
  // Zero-credit deployment baseline: a verified bundled U.S.-stock universe is always available.
  // External Sharia API refresh is opt-in only and never required for scanning.
  const bundled=bundledShariaUniverse();
  if(!force || String(process.env.SHARIA_ALLOW_API_REFRESH||'').toLowerCase()!=='true') return {...bundled,cacheStatus:'BUNDLED_LOCAL_ZERO_CREDIT'};
  if(!force && cached?.symbols?.length && age < REFRESH_MS) return {...cached, cacheStatus:'FRESH_API_CACHE'};

  const apiKey=String(process.env.HALAL_TERMINAL_API_KEY||'').trim();
  if(apiKey){
    try{
      // /api/results returns cached screening results and is substantially cheaper than re-screening
      // every symbol. We only admit rows whose AAOIFI (or, when absent, overall) verdict is COMPLIANT.
      const r=await fetch(`${BASE}/api/results`,{headers:{'X-API-Key':apiKey,'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
      if(!r.ok) throw new Error(`Halal Terminal HTTP ${r.status}`);
      const payload=await r.json();
      const rows=rowsFrom(payload);
      const symbols=clean(rows.filter(isCompliant).map(symbolOf));
      if(!symbols.length) throw new Error('No AAOIFI-compliant symbols returned');
      const saved={
        symbols,
        source:'HALAL_TERMINAL',
        methodology:'AAOIFI',
        fetchedAt:new Date().toISOString(),
        sourceUpdatedAt:payload?.updated_at||payload?.updatedAt||payload?.as_of||payload?.asOf||null,
        count:symbols.length
      };
      await store.setJSON(CACHE_KEY,saved);
      return {...saved,cacheStatus:'REFRESHED'};
    }catch(error){
      if(local?.symbols?.length) return {...local,cacheStatus:'LOCAL_DATABASE_STALE',refreshError:String(error?.message||error)};
      if(cached?.symbols?.length) return {...cached,cacheStatus:'STALE_API_CACHE',refreshError:String(error?.message||error)};
    }
  }

  // If the local database is old, it remains the independent non-API fallback after a failed refresh.
  if(local?.symbols?.length) return {...local,cacheStatus:'LOCAL_DATABASE_STALE'};

  // Manual list is a controlled fallback only. We never auto-label unknown stocks as compliant.
  const manual=clean(String(process.env.SHARIA_UNIVERSE||'').split(','));
  if(manual.length) return {symbols:manual,source:'MANUAL_ENV_FALLBACK',methodology:'AAOIFI',fetchedAt:process.env.SHARIA_UNIVERSE_UPDATED_AT||null,count:manual.length,cacheStatus:apiKey?'API_FAILED_MANUAL_FALLBACK':'NO_API_KEY_MANUAL_FALLBACK'};
  if(cached?.symbols?.length) return {...cached,cacheStatus:'STALE_API_CACHE'};

  // Bundled list is verified input data, not a guessed/fixed trading watchlist.
  if(bundled?.symbols?.length) return {...bundled,cacheStatus:'BUNDLED_LOCAL_ZERO_CREDIT'};
  return {symbols:[],source:'NO_VERIFIED_SHARIA_UNIVERSE',methodology:'AAOIFI',fetchedAt:null,count:0,cacheStatus:'UNAVAILABLE'};
}
