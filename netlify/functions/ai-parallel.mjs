import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {scalpSummary37} from './lib/ai-scalp-paper37.mjs';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async(req)=>{
 if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const store=getStore('dynamic-trading'),url=new URL(req.url),s=Math.max(1,Math.min(30,Number(url.searchParams.get('sessions')||1)));
 const idx=await store.get('ai-parallel-session-index',{type:'json',consistency:'strong'}).catch(()=>null)||{days:[]};
 const day=url.searchParams.get('day')||idx.days?.[0]||recommendationWindow().dateKey;
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return json({error:'INVALID_DATE'},400);
 const latest=await store.get('ai-parallel-latest',{type:'json',consistency:'strong'}).catch(()=>null);
 const days=url.searchParams.has('day')?[day]:(idx.days||[]).slice(0,s);
 const reports=await Promise.all(days.map(async d=>{
  const [state,advice,llmReview]=await Promise.all([store.get(`ai-parallel-state-${d}`,{type:'json',consistency:'strong'}).catch(()=>null),store.get(`ai-parallel-recommendations-${d}`,{type:'json',consistency:'strong'}).catch(()=>null),store.get(`ai-parallel-llm-review-${d}`,{type:'json',consistency:'strong'}).catch(()=>null)]);
  let visibleReview=llmReview;
  if(!visibleReview||!Array.isArray(visibleReview.suggestions)||visibleReview.status!=='REVIEW_CREATED_NOT_APPLIED'){
   const primary=await store.get(`dt37-openai37-review-${d}`,{type:'json',consistency:'strong'}).catch(()=>null);
   const recovered=primary?.status==='REVIEW_CREATED_NOT_APPLIED'?primary:
     await store.get(`dt37-openai37-review-recovery-${d}`,{type:'json',consistency:'strong'}).catch(()=>null);
   if(recovered?.status==='REVIEW_CREATED_NOT_APPLIED')visibleReview={status:recovered.status,model:recovered.model,usage:recovered.usage,
    suggestions:(recovered.review?.experiments||[]).map(x=>({area:x.area,title_ar:x.hypothesis_ar,
     hypothesis_ar:x.hypothesis_ar,experiment_ar:x.test_ar,risk_ar:x.expected_risk_ar,
     evidence_ids:x.evidence_ids,confidence_qualitative:x.confidence,changeApproved:false}))};
  }
  return {dateKey:d,status:state?.updatedAt?'RECORDED':'NOT_RECORDED',updatedAt:state?.updatedAt||null,cycles:state?.cycles||0,
   scannedSymbols:state?.cumulativeScanned?.length||0,aiPositions:Object.values(state?.records||{}).filter(x=>x.position).map(x=>({symbol:x.symbol,...x.position})),
   scalp37:{status:state?.scalp37?.status||'NOT_RECORDED',summary:scalpSummary37(state?.scalp37),
    positions:Object.values(state?.scalp37?.records||{}).filter(x=>x?.position).map(x=>({symbol:x.symbol,...x.position})).slice(0,50),
    watches:Object.values(state?.scalp37?.records||{}).filter(x=>x?.pending).map(x=>({symbol:x.symbol,type:x.pending.type,reason:x.reason,signalMinute:x.pending.signalMinute})).slice(0,50),
    closedOutcomes:(state?.scalp37?.closedOutcomes||[]).slice(0,50)},
   transitions:Object.values(state?.records||{}).filter(x=>['SMART','AI_PAPER_CONFIRMED'].includes(x.state)).map(x=>({symbol:x.symbol,state:x.state,reason:x.reason,features:x.latestFeatures,checks:x.latestChecks,quote:x.latestQuote,adaptiveParameters:x.latestPolicy?.params,confidence:x.latestConfidence})),
   recommendations:advice||null,llmReview:visibleReview||{status:'DISABLED_OR_NOT_RUN',suggestions:[]}};}));
 return json({version:'3.7 + AI Research Parallel',mode:'BACKGROUND_INDEPENDENT_PAPER',model:'ADAPTIVE_STATISTICAL_RESEARCH_NOT_LLM',latest,days:reports,
  availableSessions:idx.days?.length||0,productionScannerUnchanged:true,noOrders:true});
};
export const config={path:'/api/ai-parallel'};
