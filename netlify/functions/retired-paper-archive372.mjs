import {getStore} from '@netlify/blobs';
import {retiredArchiveKey372} from './lib/retired-paper-archive372.mjs';
export default async request=>{
 const json=(v,status)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const day=new URL(request.url).searchParams.get('day');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(day||''))return json({error:'INVALID_DAY'},400);
 try{
  const store=getStore('dynamic-trading');
  const saved=await store.get(retiredArchiveKey372(day),{type:'json',consistency:'strong'});
  // Old sessions remain readable without a migration job or writes on a GET.
  if(saved)return json(saved,200);
  const [ai,standalone]=await Promise.all([store.get(`ai-parallel-state-${day}`,{type:'json',consistency:'strong'}),
   store.get(`dt37-standalone-scalp-state-${day}`,{type:'json',consistency:'strong'})]);
  return ai?.scalp37||standalone?json({day,embedded:ai?.scalp37||null,standalone:standalone||null,readOnly:true},200):json({error:'NOT_RECORDED'},404);
 }catch{return json({error:'ARCHIVE_UNAVAILABLE'},503);}
};
export const config={path:'/api/retired-paper-archive'};
