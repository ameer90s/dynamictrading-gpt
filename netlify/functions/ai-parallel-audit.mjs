import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async(req)=>{
 if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const url=new URL(req.url),day=url.searchParams.get('day')||recommendationWindow().dateKey,kind=url.searchParams.get('kind')==='scanner'?'scanner':'ai-parallel';
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return json({error:'INVALID_DATE'},400);
 const until=Math.max(570,Math.min(959,Number(url.searchParams.get('until')||959)));
 const pages=Math.max(1,Math.min(390,Number(url.searchParams.get('minutes')||10)));
 const store=getStore('dynamic-trading'),prefix=kind==='scanner'?'scanner-audit':'ai-parallel-audit';
 const minutes=[];for(let i=until;i>=570&&minutes.length<pages;i--)minutes.push(i);
 const docs=[];for(let i=0;i<minutes.length;i+=20){const part=await Promise.all(minutes.slice(i,i+20).map(m=>store.get(`${prefix}-${day}-${String(m).padStart(4,'0')}`,{type:'json',consistency:'strong'}).catch(()=>null)));docs.push(...part.filter(Boolean));}
 const flat=docs.flatMap(d=>d.records||d.snapshots||[]);
 if(url.searchParams.get('format')==='csv'){
  const keys=['at','symbol','kind','from','to','state','reason','completedBarAt','features','checks','quote','policy'];
  const val=x=>'"'+String(x==null?'':typeof x==='object'?JSON.stringify(x):x).replace(/"/g,'""')+'"';
  const csv=[keys.join(','),...flat.map(r=>keys.map(k=>val(r[k]??(k==='completedBarAt'?r.at:null))).join(','))].join('\n');
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${prefix}-${day}.csv"`,'Cache-Control':'no-store'}});
 }
 return json({dateKey:day,kind,fromMinute:Math.min(...minutes),untilMinute:until,requestedMinutes:pages,foundMinutes:docs.length,totalRecords:flat.length,
  documents:docs,notes:'Every scanned minute is stored as a standalone immutable-by-minute audit; missing minute means no successful archival record.'});
};
export const config={path:'/api/ai-parallel-audit'};
