import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {prepareEvidenceForModel,requestOptionalAiLlmReview} from './lib/ai-llm-review36.mjs';
export default async()=>{
 if(process.env.OPENAI_RESEARCH_ENABLED==='true')return new Response('Legacy LLM disabled: daily research enabled');
 if(process.env.AI_LLM_REVIEW_ENABLED!=='true')return new Response('Optional LLM review disabled');
 if(!process.env.OPENAI_RESEARCH_API_KEY||!process.env.OPENAI_RESEARCH_MODEL)return new Response('Optional LLM review not configured');
 const clock=recommendationWindow();if(!clock.isTradingDay||clock.session!=='REGULAR')return new Response('Outside market session');
 const store=getStore('dynamic-trading'),day=clock.dateKey;
 const [state,recs,scanner]=await Promise.all([
  store.get(`ai-parallel-state-${day}`,{type:'json',consistency:'strong'}).catch(()=>null),
  store.get(`ai-parallel-recommendations-${day}`,{type:'json',consistency:'strong'}).catch(()=>null),
  store.get(`signal-history-${day}`,{type:'json',consistency:'strong'}).catch(()=>null)]);
 if(!state?.updatedAt)return new Response('No AI observations yet');
 const asof=state.updatedAt,old=await store.get(`ai-parallel-llm-review-${day}`,{type:'json',consistency:'strong'}).catch(()=>null);
 if(old?.basedOn===asof)return new Response('No new observations to review');
 const scannerSummary={symbols:Object.keys(scanner?.signals||{}).length,
   confirmed:Object.values(scanner?.signals||{}).reduce((a,x)=>a+(x.confirmedSignals?.length||0),0),
   delivered:Object.values(scanner?.signals||{}).reduce((a,x)=>a+(x.confirmedSignals||[]).filter(t=>!!t.pushSentAt).length,0)};
 const evidence=prepareEvidenceForModel({dateKey:day,aiState:state,statistics:recs,scannerSummary,
  coverage:{eligible:state.lastPolicy?.inputs?.observedSymbols||null,everScanned:state.cumulativeScanned?.length||0}});
 let report;try{report=await requestOptionalAiLlmReview(evidence,{enabled:true,apiKey:process.env.OPENAI_RESEARCH_API_KEY,model:process.env.OPENAI_RESEARCH_MODEL});}
 catch(e){report={status:'REVIEW_FAILED',error:String(e.message||e).slice(0,180),suggestions:[]};}
 const doc={day,basedOn:asof,recordedAt:new Date().toISOString(),...report};
 await store.setJSON(`ai-parallel-llm-review-${day}`,doc);await store.setJSON(`ai-parallel-llm-review-${day}-${clock.minuteOfDay}`,doc);
 return new Response(`AI researcher ${report.status}; suggestions ${(report.suggestions||[]).length}`);
};
