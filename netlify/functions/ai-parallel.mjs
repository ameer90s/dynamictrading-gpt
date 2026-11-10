import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function readAi(req){
 if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const store=getStore('dynamic-trading'),url=new URL(req.url),s=Math.max(1,Math.min(30,Number(url.searchParams.get('sessions')||1)));
 const idx=await store.get('ai-parallel-session-index',{type:'json',consistency:'strong'})||{days:[]};
 const day=url.searchParams.get('day')||idx.days?.[0]||recommendationWindow().dateKey;
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return json({error:'INVALID_DATE'},400);
 const latest=await store.get('ai-parallel-latest',{type:'json',consistency:'strong'});
 const days=url.searchParams.has('day')?[day]:(idx.days||[]).slice(0,s);
 // Summarize recorded research observations without exposing the full archive
 // or inflating the dashboard with raw price histories.
 const researchSummary=state=>{
  const recs=Object.values(state?.records||{}),active=[],byPattern={},outcomes={};
  for(const row of recs){
   for(const p of row.activeResearchPatterns||[]){
    byPattern[p.type]=(byPattern[p.type]||0)+1;
    active.push({symbol:row.symbol,type:p.type,barTime:p.barTime||p.evidence?.barTime||null,
     researchScore:p.researchScore,mode:'RESEARCH_ONLY_NOT_TRADE_APPROVED'});
   }
   for(const observation of Object.values(row.researchPatternShadows||{})){
    if(observation.status==='OBSERVED_OUTCOME')outcomes[observation.outcome]=(outcomes[observation.outcome]||0)+1;
   }
  }
  return {version:state?.researchPatternCatalog?.version||null,
   assessedSymbols:recs.length,currentlyDetected:active.length,active:active.slice(0,40),
   byPattern,outcomes:state?.researchOutcomeCounters||outcomes,entryApproved:false,noBrokerOrders:true,
   recentEvents:(state?.recentLifecycleEvents||[])
     .filter(x=>String(x.kind||'').startsWith('RESEARCH_PATTERN_')).slice(-20),
   completeEventHistory:'/api/ai-parallel-audit?kind=ai-parallel&format=json',
   note:'Only research observations. A favorable bar proxy is not a trade or profit.'};
 };
 const reports=await Promise.all(days.map(async d=>{
  // AI proposals are internal only. Never copy Research Agent's paid report into AI.
  const [state,advice]=await Promise.all([store.get(`ai-parallel-state-${d}`,{type:'json',consistency:'strong'}),store.get(`ai-parallel-recommendations-${d}`,{type:'json',consistency:'strong'})]);
  if(state?.publication372)return {dateKey:d,status:'PERSISTENCE_PENDING_NOT_ACTIONABLE',
   updatedAt:state.updatedAt,aiPositions:[],closedPaperTrades:[],transitions:[],recommendations:null,
   internalReport:null,persistencePending:true,retiredArchive:state.retiredArchive372||null};
  return {dateKey:d,status:state?.updatedAt?'RECORDED':'NOT_RECORDED',updatedAt:state?.updatedAt||null,cycles:state?.cycles||0,
   scannedSymbols:state?.cumulativeScanned?.length||0,
   lifecycle:{eventCount:state?.lifecycleEventCount||0,recentEvents:(state?.recentLifecycleEvents||[]).slice(-30),
    archivedPerMinute:true,auditRoute:'/api/ai-parallel-audit'},
   closedPaperTrades:(state?.closedOutcomes||[]).map(p=>({id:p.id,symbol:p.symbol||p.id?.split(':')[1],setupType:p.setupType,
      openedAt:p.openedAt,closedAt:p.closedAt,entry:p.entry,stop:p.stop,target:p.target,qty:p.qty,
      feesUsd:p.feesUsd,netUsd:p.netUsd,outcome:p.outcome,entryEvidence:p.entryEvidence,
      exitEvidence:p.exitEvidence,timeline:p.timeline})),aiPositions:Object.values(state?.records||{}).filter(x=>x.position).map(x=>({symbol:x.symbol,...x.position})),
   transitions:Object.values(state?.records||{}).filter(x=>['SMART','AI_PAPER_CONFIRMED'].includes(x.state)).map(x=>({symbol:x.symbol,state:x.state,reason:x.reason,features:x.latestFeatures,checks:x.latestChecks,quote:x.latestQuote,adaptiveParameters:x.latestPolicy?.params,confidence:x.latestConfidence})),
   recommendations:advice||null,internalReport:advice?.internalReport||null,researchPatterns:researchSummary(state),
   retiredArchive:state?.retiredArchive372||null,
   llmReview:{status:'NOT_SHARED_WITH_RESEARCH_AGENT',suggestions:[]}};}));
 return json({version:'3.7 + AI Research Parallel',mode:'BACKGROUND_INDEPENDENT_PAPER',model:'ADAPTIVE_STATISTICAL_RESEARCH_NOT_LLM',latest,days:reports,
  availableSessions:idx.days?.length||0,productionScannerUnchanged:true,noOrders:true});
}
export default async req=>{try{return await readAi(req)}catch{return json({error:'AI_ARCHIVE_UNAVAILABLE',status:'NOT_VERIFIED'},503)}};
export const config={path:'/api/ai-parallel'};
