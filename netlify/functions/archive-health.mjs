/** Read-only Netlify Blobs archive health. No keys or sensitive content returned. */
import {recommendationWindow} from './lib/time.mjs';
export async function archiveHealth(req,injectedStore){
 const store=injectedStore||(await import('@netlify/blobs')).getStore('dynamic-trading');
 if(req.method!=='GET')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
 const u=new URL(req.url),day=u.searchParams.get('day')||recommendationWindow().dateKey;
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return Response.json({error:'INVALID_DATE'},{status:400});
 const end=Math.max(570,Math.min(959,Number(u.searchParams.get('until')||959)));
 const count=Math.max(1,Math.min(390,Number(u.searchParams.get('minutes')||390)));
 const out={version:'3.7',dateKey:day,checkedAt:new Date().toISOString(),window:{until:end,minutes:count},streams:{}};
 for(const [name,prefix] of [['scanner','scanner-audit'],['ai','ai-parallel-audit']]){
  let found=0,records=0,zeroCandidateMinutes=0,errors=0;const missing=[];let lastStoredAt=null;
  const mins=Array.from({length:count},(_,i)=>end-i).filter(x=>x>=570);
  for(let i=0;i<mins.length;i+=20){
   const rows=await Promise.all(mins.slice(i,i+20).map(async m=>{
    try{return {m,data:await store.get(`${prefix}-${day}-${String(m).padStart(4,'0')}`,{type:'json',consistency:'strong'})}}catch(e){return {m,error:String(e?.message||e)}};
   }));
   for(const {m,data,error} of rows){if(error){errors++;missing.push(m);continue}if(!data){missing.push(m);continue}
    found++;const n=(data.records||data.snapshots||[]).length;records+=n;if(!n)zeroCandidateMinutes++;if(data.storedAt&&(!lastStoredAt||data.storedAt>lastStoredAt))lastStoredAt=data.storedAt;
   }
  }
  out.streams[name]={foundMinutes:found,missingMinutes:missing,records,zeroCandidateMinutes,readErrors:errors,lastStoredAt};
 }
 out.ok=Object.values(out.streams).every(x=>x.foundMinutes>0&&x.readErrors===0);
 return Response.json(out,{status:out.ok?200:503,headers:{'Cache-Control':'no-store'}});
}
export default async req=>archiveHealth(req);
export const config={path:'/api/archive-health'};
