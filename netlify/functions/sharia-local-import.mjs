import {getStore} from '@netlify/blobs';
import {saveLocalShariaDatabase} from './lib/sharia-local.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
export default async(req)=>{
  if(req.method!=='POST') return json({error:'POST required'},405);
  const expected=String(process.env.SHARIA_ADMIN_TOKEN||'').trim();
  const supplied=String(req.headers.get('x-sharia-admin-token')||'').trim();
  if(!expected||supplied!==expected) return json({error:'Unauthorized'},401);
  try{
    const payload=await req.json();
    const saved=await saveLocalShariaDatabase(getStore('dynamic-trading'),payload);
    return json({ok:true,source:saved.source,sourceName:saved.sourceName,methodology:saved.methodology,asOf:saved.fetchedAt,count:saved.count});
  }catch(e){return json({error:String(e?.message||e)},400);}
};
