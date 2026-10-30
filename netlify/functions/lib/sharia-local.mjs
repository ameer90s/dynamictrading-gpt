// v3.5 — non-API Sharia fallback database.
// This store is populated from a verified AAOIFI snapshot (CSV/JSON/manual import) and does not consume external API credits.
export const LOCAL_SHARIA_KEY='sharia-local-aaoifi-v351';
export const LOCAL_MAX_AGE_MS=90*24*60*60*1000;
const clean=(xs=[])=>[...new Set(xs.map(x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'')).filter(Boolean))];
const verdict=x=>String(x?.aaoifiStatus||x?.AAOIFI||x?.verdict||x?.status||x?.compliance_status||'').trim().toUpperCase();
const symbol=x=>x?.symbol||x?.ticker||'';
export function normalizeLocalShariaSnapshot(payload={}){
  const rows=Array.isArray(payload)?payload:(payload.rows||payload.results||payload.data||payload.stocks||[]);
  const symbols=clean(rows.filter(r=>['COMPLIANT','HALAL'].includes(verdict(r))).map(symbol));
  const asOf=payload.asOf||payload.as_of||payload.updatedAt||payload.updated_at||null;
  const sourceName=String(payload.sourceName||payload.source||'LOCAL_VERIFIED_SNAPSHOT').trim().slice(0,120);
  return {symbols,source:'LOCAL_SHARIA_DATABASE',sourceName,methodology:'AAOIFI',fetchedAt:asOf,sourceUpdatedAt:asOf,count:symbols.length};
}
export async function loadLocalShariaDatabase(store){
  const raw=await store.get(LOCAL_SHARIA_KEY,{type:'json',consistency:'strong'}).catch(()=>null);
  if(!raw) return null;
  const normalized=normalizeLocalShariaSnapshot(raw);
  if(!normalized.symbols.length) return null;
  const stamp=Date.parse(normalized.fetchedAt||'');
  const ageMs=Number.isFinite(stamp)?Math.max(0,Date.now()-stamp):Infinity;
  return {...normalized,ageMs,isFresh:ageMs<=LOCAL_MAX_AGE_MS};
}
export async function saveLocalShariaDatabase(store,payload){
  const normalized=normalizeLocalShariaSnapshot(payload);
  if(!normalized.symbols.length) throw new Error('Local Sharia snapshot has no AAOIFI COMPLIANT symbols');
  if(!normalized.fetchedAt||!Number.isFinite(Date.parse(normalized.fetchedAt))) throw new Error('Local Sharia snapshot requires a valid asOf date');
  const saved={schemaVersion:'3.5',methodology:'AAOIFI',sourceName:normalized.sourceName,asOf:normalized.fetchedAt,rows:normalized.symbols.map(symbol=>({symbol,aaoifiStatus:'COMPLIANT'})),importedAt:new Date().toISOString()};
  await store.setJSON(LOCAL_SHARIA_KEY,saved);
  return normalizeLocalShariaSnapshot(saved);
}
