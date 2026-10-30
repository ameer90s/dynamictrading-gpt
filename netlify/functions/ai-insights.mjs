import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {HISTORY_INDEX_KEY} from './lib/version.mjs';
import {computeAiAdvisor36} from './lib/ai-advisor36.mjs';
export default async(req)=>{
 if(req.method!=='GET')return json({error:'method'},405);
 const store=getStore('dynamic-trading'),idx=await store.get(HISTORY_INDEX_KEY,{type:'json',consistency:'strong'}),date=recommendationWindow().dateKey;
 const days=[...new Set([date,...(idx?.sessions||[]).map(x=>x.dateKey)])].filter(Boolean).sort().reverse().slice(0,30);
 const rows=await Promise.all(days.map(async x=>await store.get(`signal-history-${x}`,{type:'json',consistency:'strong'}).catch(()=>null)));
 return json(computeAiAdvisor36(rows.filter(Boolean)));
};
export const config={path:'/api/ai-insights'};
function json(x,status=200){return new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
