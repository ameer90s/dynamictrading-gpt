/** Read-only status for the independent Research Agent dashboard. No keys or private raw logs sent. */
import {getStore} from '@netlify/blobs';
import {newYorkDay} from './lib/research-openai37.mjs';
import {publicResearchSummary} from './lib/research-public37.mjs';
const json=(x,code=200)=>new Response(JSON.stringify(x),{status:code,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export default async function handler(request){
  const url=new URL(request.url);
  const supplied=url.searchParams.get('day');
  const day=supplied===null?newYorkDay():supplied;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return json({error:'BAD_DATE'},400);
  try{
    const store=getStore('dynamic-trading');
    const keys=[`dt37-openai37-review-${day}`,`dt37-research-agent-daily-${day}`,`dt37-research-evidence-quality-${day}`];
    const [review,local,evidence]=await Promise.all(keys.map(k=>store.get(k,{type:'json',consistency:'strong'})));
    let budget=null;
    // The research budget is not a trading account balance; only expose aggregated usage counts.
    try{budget=await store.get('dt37-openai37-budget-one-month-20261102',{type:'json',consistency:'strong'});}catch{ /* Optional budget status only */ }
    return json(publicResearchSummary({day,review,local,evidence,budget}));
  }catch(e){return json({day,status:'ARCHIVE_UNAVAILABLE',error:'READ_FAILED',mode:'PAPER_ONLY'},503)}
}
