import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
export default async(req)=>{
  if(req.method!=='GET')return json({error:'method'},405);
  const store=getStore('dynamic-trading'),day=recommendationWindow().dateKey;
  const p=await store.get(`signal-history-${day}`,{type:'json',consistency:'strong'});
  const rows=[];
  for(const rec of Object.values(p?.signals||{})){
    for(const x of (rec.transitions||[])){
      if(x.version!=='3.6'||!['SMART','CONFIRMED'].includes(x.state))continue;
      rows.push({symbol:rec.symbol,at:x.at,from:x.previousState,to:x.state,kind:x.event||'STATE_TRANSITION',
        reason:x.reason,qualityScore:x.qualityScore,confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
        openingChecks:x.openingChecks,confirmationChecks:x.confirmationChecks,executionChecks:x.executionChecks,
        features:x.observedFeatures,quote:x.actualQuote,model:x.retestModel,trigger:x.trigger,profitCapacity:x.profitCapacity,
        shadowTargets:x.profitCapacity?.shadow||null});
    }
  }
  rows.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return json({version:'3.6',dateKey:day,cards:rows.slice(0,80),total:rows.length,
    notes:'FACTUAL PROGRAM GATES; no claim of verified cause of market outcome'});
};
export const config={path:'/api/transition-cards'};
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
