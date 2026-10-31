/** Complete per-minute base scanner diagnostic archive, separate from concise cards.
 * Unlike signal-history's 120/90 ring buffers this audit does not trim any
 * discovery record of a completed minute and includes REGULAR/WAIT exclusions.
 */
import {recordResearchMinute} from './research-ledger37.mjs';
export async function writeScannerAudit36(store,dateKey,minute,rows,{eligibleCount=0,attempted=[],errors=[],shariaEvidence=null}={}){
 const key=`scanner-audit-${dateKey}-${String(minute).padStart(4,'0')}`;
 const latest=(rows||[]).filter(x=>x?.symbol).map(x=>({symbol:x.symbol,at:x.research36?.features?.completedBarAt||null,
  state:x.recommendationState||'WAIT',reason:x.stateReason||x.research36?.reason||null,
  attempted:true,source:x.research36?.features?.source||null,features:x.research36?.features||null,
  openingChecks:x.research36?.openingChecks||[],confirmationChecks:x.research36?.confirmationChecks||[],executionChecks:x.research36?.executionChecks||[],
  quote:x.research36?.quote||null,price:x.price??null,focusRank:x.focusRank??null,
  setupFamily:x.metrics?.setupFamily||null,retestModel:x.research36?.retestModel||null,
  trigger:x.research36?.trigger||null,riskEvidence:x.research36?.risk||null,qualityScore:x.research36?.qualityScore??null,
  tradePlan:x.recommendationState==='CONFIRMED'?{signalId:x.signalId||null,entry:x.price??null,entryLow:x.entryLow??null,entryHigh:x.entryHigh??null,
    stopLoss:x.stopLoss??null,tp1:x.target1??null,tp2:x.target2??null,tp3:x.target3??null,
    targetConfidence:x.targetConfidence||null,recommendedTarget:x.recommendedTarget||null,shadowTargets:x.shadowTargets||null}:null,
  observer:'BASE_3.7',confidenceUncalibrated:true}));
 const seen=new Set(latest.map(r=>r.symbol));
 for(const symbol of [...new Set(attempted)].filter(Boolean)){if(!seen.has(symbol))latest.push({symbol,state:'UNRESOLVED',reason:'ATTEMPTED_NO_RESULT',attempted:true,source:null,features:null,openingChecks:[],confirmationChecks:[],executionChecks:[],quote:null,price:null,focusRank:null,observer:'BASE_3.7',confidenceUncalibrated:true});}
 const obj={version:'3.7',cycleStatus:'COMPLETED',day:dateKey,minute,storedAt:new Date().toISOString(),eligibleCount,attemptedSymbols:attempted,
  records:latest,errors,shariaEvidence,coverage:{attempted:[...new Set(attempted)].length,completed:seen.size,missing:[...new Set(attempted)].filter(x=>!seen.has(x)),unresolvedCount:[...new Set(attempted)].filter(x=>!seen.has(x)).length}};
 await store.setJSON(key,obj);
 // Best-effort secondary research index. Raw per-minute archive remains authoritative.
 // A missing ledger minute blocks paid daily research; never interrupt user alerts.
 try{if(typeof store?.get==='function')await recordResearchMinute({store,kind:'scanner',day:dateKey,doc:obj});}
 catch(e){console.error('DT37_SCANNER_RESEARCH_LEDGER_FAILED',String(e?.message||e).slice(0,100));}
 return obj;
}

/** Failures before analysis still get an explicit archived minute. */
export async function writeScannerFailure37(store,dateKey,minute,reason,shariaEvidence=null){
 const key=`scanner-audit-${dateKey}-${String(minute).padStart(4,'0')}`;
 const prior=await store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);
 if(prior){
   await store.setJSON(`scanner-post-audit-failure-${dateKey}-${String(minute).padStart(4,'0')}`,
     {day:dateKey,minute,reason:String(reason).slice(0,120),at:new Date().toISOString(),rawAuditPreserved:true});
   return prior;
 }
 const doc={version:'3.7',cycleStatus:'FAILED',day:dateKey,minute,storedAt:new Date().toISOString(),
  records:[],attemptedSymbols:[],errors:[{reason:String(reason).slice(0,120)}],
  shariaEvidence,coverage:{attempted:0,completed:0,missing:[]}};
 await store.setJSON(key,doc);
 try{await recordResearchMinute({store,kind:'scanner',day:dateKey,doc});}
 catch(e){console.error('DT37_SCANNER_FAILED_MINUTE_LEDGER_FAILED',String(e?.message||e).slice(0,100));}
 return doc;
}
