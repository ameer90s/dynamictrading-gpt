import {recommendationWindow} from './lib/time.mjs';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function serveAudit(req, injectedStore){
 if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const url=new URL(req.url),day=url.searchParams.get('day')||recommendationWindow().dateKey,kind=url.searchParams.get('kind')==='scanner'?'scanner':'ai-parallel';
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return json({error:'INVALID_DATE'},400);
 const until=Math.max(570,Math.min(959,Number(url.searchParams.get('until')||959)));
 const pages=Math.max(1,Math.min(390,Number(url.searchParams.get('minutes')||(url.searchParams.has('format')?'390':'10'))));
 const store=injectedStore||(await import('@netlify/blobs')).getStore('dynamic-trading'),prefix=kind==='scanner'?'scanner-audit':'ai-parallel-audit';
 const minutes=[];for(let i=until;i>=570&&minutes.length<pages;i--)minutes.push(i);
 const docs=[];for(let i=0;i<minutes.length;i+=20){const part=await Promise.all(minutes.slice(i,i+20).map(m=>store.get(`${prefix}-${day}-${String(m).padStart(4,'0')}`,{type:'json',consistency:'strong'}).catch(()=>null)));docs.push(...part.filter(Boolean));}
 const flat=docs.flatMap(d=>d.records||d.snapshots||[]);
 const missingMinutes=minutes.filter(m=>!docs.some(d=>Number(d.minute)===m));
 if(url.searchParams.get('format')==='csv'){
  const keys=['minute','storedAt','at','symbol','state','reason','source','price','focusRank','attempted','features','openingChecks','confirmationChecks','executionChecks','checks','quote','policy','adaptiveParameters','confidence','coverage','errors','eligibleCount','attemptedSymbols','feedErrors','transitions','closedNew','recommendations'];
  const val=x=>'"'+String(x==null?'':typeof x==='object'?JSON.stringify(x):x).replace(/"/g,'""')+'"';
  const csv=[keys.join(','),...docs.flatMap(d=>{const rows=d.records||d.snapshots||[];return (rows.length?rows:[{state:'NO_CANDIDATES',reason:'MINUTE_ARCHIVED_ZERO_RECORDS'}]).map(r=>keys.map(k=>val(r[k]??d[k]??(k==='minute'?d.minute:k==='storedAt'?d.storedAt:null))).join(','));})].join('\r\n');
  return new Response(csv,{status:docs.length?200:404,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${prefix}-${day}.csv"`,'Cache-Control':'no-store'}});
 }
 const body={dateKey:day,kind,fromMinute:Math.min(...minutes),untilMinute:until,requestedMinutes:pages,foundMinutes:docs.length,totalRecords:flat.length,missingMinutes,
  documents:docs,notes:'Every scanned minute is stored as a standalone immutable-by-minute audit; missing minute means no successful archival record.'};
 if(url.searchParams.get('format')==='json')return new Response(JSON.stringify(body),{status:docs.length?200:404,headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${prefix}-${day}.json"`,'Cache-Control':'no-store'}});
 return json(body);
};
export const config={path:'/api/ai-parallel-audit'};

export default async(req)=>serveAudit(req);
