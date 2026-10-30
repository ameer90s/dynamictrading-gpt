import {STRATEGY_VERSION,STRATEGY_ID,SCHEMA_VERSION,HISTORY_INDEX_KEY} from './version.mjs';
import {buildAiShadow} from './ai-shadow.mjs';
// v3.6: use a stable setup fingerprint; never use a changing Ask price in the ID.
// An active same-model signal keeps its ID, while a genuinely new setup after
// closure receives a fresh sequence suffix, keeping push notifications deduped.
function setupFingerprint(r,dateKey){const family=String(r?.metrics?.setupFamily||'SETUP');return `${dateKey}:${r.symbol}:${family}`;}
function snapshot(r){return {confidence:Number(r.confidence||0),setupFamily:r.metrics?.setupFamily||null,setupQuality:Number(r.metrics?.setupQuality||0),retestQuality:Number(r.metrics?.retestQuality||0),mtfAlignment:Number(r.metrics?.mtfAlignment||0),relativeVolume:Number(r.metrics?.relativeVolume||0),relativeStrengthPct:Number(r.metrics?.relativeStrengthPct||0),benchmarkChangePct:Number(r.metrics?.benchmarkChangePct||0),marketRegime:r.filters?.marketRegime||null,indexAlignment:r.filters?.marketRegime==='TREND_UP'?'ALIGNED':r.filters?.marketRegime==='TREND_DOWN'?'NON_ALIGNED':'MIXED',sectorAlignment:'UNAVAILABLE',roomR:Number(r.metrics?.roomR||0),chaseDistanceAtr:Number(r.metrics?.chaseDistanceAtr||0),distanceFromSessionHighPct:Number(r.metrics?.distanceFromSessionHighPct||0),sessionChangePct:Number(r.metrics?.sessionChangePct||0),bid:Number(r.metrics?.bid||0),ask:Number(r.metrics?.ask||0),last:Number(r.price||0),spreadBps:Number(r.metrics?.spreadBps||0),quoteAgeSec:Number(r.metrics?.quoteAgeSec||0),quoteFresh:r.metrics?.quoteFresh===true,newsRisk:Number(r.news?.riskScore||0),newsSentiment:Number(r.news?.sentimentScore||0),targetConfidence:r.targetConfidence||null,recommendedTarget:r.recommendedTarget||null,priceBucket:Number(r.price||0)<5?'0-4.99':Number(r.price||0)<10?'5-9.99':'10-200',recordClass:'ACTUAL_PROGRAM_SIGNAL',strategyVersion:STRATEGY_VERSION,focusRank:r.focusRank||null,focusTier:r.focusTier||null,focusScore:Number(r.focusScore||0)};}
async function indexSession(store,dateKey,updatedAt){const current=await store.get(HISTORY_INDEX_KEY,{type:'json',consistency:'strong'})||{schemaVersion:SCHEMA_VERSION,sessions:[]};const map=new Map((current.sessions||[]).map(x=>[x.dateKey,x]));map.set(dateKey,{dateKey,key:`signal-history-${dateKey}`,updatedAt,version:STRATEGY_VERSION});current.schemaVersion=SCHEMA_VERSION;current.updatedAt=updatedAt;current.sessions=[...map.values()].sort((a,b)=>b.dateKey.localeCompare(a.dateKey)).slice(0,60);await store.setJSON(HISTORY_INDEX_KEY,current);}
export async function updateSignalHistory(store,data,dateKey){
 if(!store||!data||!dateKey)return;const key=`signal-history-${dateKey}`;const payload=await store.get(key,{type:'json',consistency:'strong'})||{dateKey,strategyVersion:STRATEGY_ID,version:STRATEGY_VERSION,signals:{},events:[]};payload.strategyVersion=STRATEGY_ID;payload.version=STRATEGY_VERSION;payload.schemaVersion=SCHEMA_VERSION;const now=data.generatedAt||new Date().toISOString();
 for(const r of (data.display8||data.all||[])){if(!r?.symbol||!r.recommendationState)continue;const s=r.symbol,state=r.recommendationState;const rec=payload.signals[s]||{symbol:s,firstSeenAt:now,transitions:[],confirmedSignals:[]};const last=rec.transitions.at(-1);const trace=r.research36||null;
  const moved=!last||last.state!==state;
  // Every change of *blocking reason* is also audited (not mistaken for a new state).
  const blockerChanged=rec.lastGateReason!==r.stateReason;
  if(moved||blockerChanged){const ev={at:now,symbol:s,state,previousState:last?.state&&last.state!=='WAIT'?last.state:'REGULAR',event:moved?'STATE_TRANSITION':'GATE_REASON_UPDATE',price:Number(r.price||0),
    reason:r.stateReason||r.filters?.rejectedReason||null,rejectedReason:r.filters?.rejectedReason||null,
    qualityScore:r.profitPotentialScore??null,confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
    setup:r.metrics?.setupFamily||null,version:STRATEGY_VERSION,
    completedBarAt:trace?.features?.completedBarAt||null,
    openingChecks:trace?.openingChecks||[],confirmationChecks:trace?.confirmationChecks||[],executionChecks:trace?.executionChecks||[],
    observedFeatures:trace?.features||null,actualQuote:trace?.quote||null,retestModel:trace?.retestModel||null,
    trigger:trace?.trigger||null,profitCapacity:trace?.risk||null};
    if(moved)rec.transitions.push(ev);else{rec.gateChanges=(rec.gateChanges||[]).slice(-89);rec.gateChanges.push(ev);}
    payload.events.push({at:ev.at,symbol:s,state,event:ev.event,previousState:ev.previousState,reason:ev.reason,version:ev.version});}
  rec.lastGateReason=r.stateReason||null;
  if(trace?.features){rec.lastDecision={at:now,state,reason:trace.reason,features:trace.features,checks:trace.checks,quote:trace.quote,
    qualityScore:trace.qualityScore,confidenceProbability:null,confidenceStatus:'UNCALIBRATED',retestModel:trace.retestModel};}
  // Retain periodic as-of SMART snapshots for analysis without exploding the Blob size.
  if(state==='SMART'&&trace?.features){const key=trace.features.completedBarAt;if(rec.lastSampleBar!==key){
    rec.smartObservations=(rec.smartObservations||[]).slice(-119);
    rec.smartObservations.push({at:now,completedBarAt:key,state,reason:trace.reason,features:trace.features,
      gates:trace.checks,quote:trace.quote,qualityScore:trace.qualityScore});rec.lastSampleBar=key;}}
  rec.transitions=rec.transitions.slice(-120);
  if(state==='CONFIRMED'){const base=setupFingerprint(r,dateKey);let sig=(last?.state==='CONFIRMED')?rec.confirmedSignals.find(x=>x.active&&!x.finalOutcome&&x.setupKey===base):null;if(!sig){const seq=rec.confirmedSignals.filter(x=>String(x.signalId||'').startsWith(base)).length+1;const priorSame=rec.confirmedSignals.filter(x=>x.setupKey===base).length;sig={signalId:`${base}:${seq}`,setupKey:base,setupOccurrence:priorSame+1,repeatClass:priorSame?'REPEAT_SAME_SETUP':'NEW_SETUP',active:true,confirmedAt:now,entry:Number(r.price||0),entryLow:Number(r.entryLow||0),entryHigh:Number(r.entryHigh||0),t1:Number(r.target1||0),t2:Number(r.target2||0),t3:Number(r.target3||0),sl:Number(r.stopLoss||0),maxPrice:Number(r.price||0),minPrice:Number(r.price||0),hits:[],features:snapshot(r),recommendedTarget:r.recommendedTarget||null,targetConfidence:r.targetConfidence||null,outcomeBasis:'IEX_1M_AFTER_CONFIRMATION',version:STRATEGY_VERSION,strategyVersion:STRATEGY_ID,lowestBeforeRally:null,lowestBeforeRallyAt:null,timeToLowSec:null,recoveryAt:null,recoveryTimeSec:null,maePct:null,mfePct:null,preT3Continuation:{mode:'SHADOW_MEASUREMENT',status:'PENDING'},shadow:{mode:'MEASUREMENT',startedAt:null,approvedAt:null},aiShadow:buildAiShadow(r),
    profitPotentialScore:r.profitPotentialScore??null,confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
    netPaperCapacity:r.entryCostModel||null,livePaperOnly:true,
    researchDecision:r.research36?{features:r.research36.features,checks:r.research36.checks,quote:r.research36.quote,
      reason:r.research36.reason,retestModel:r.research36.retestModel,trigger:r.research36.trigger}:null,
    shadowTargets:Object.fromEntries(Object.entries(r.shadowTargets||{}).map(([mode,target])=>[mode,{mode,target,
      firstHitAt:null,stopFirstAt:null,postExitHitAt:null,status:'TRACKING',maxPrice:r.price,minPrice:r.price}])),
    delivery:{generatedAt:now,savedAt:now,status:'SAVED'}};const smartTransition=[...rec.transitions].reverse().find(x=>x.state==='SMART');if(smartTransition?.at){sig.firstSmartAt=smartTransition.at;sig.smartToConfirmedSec=Math.max(0,(Date.parse(now)-Date.parse(smartTransition.at))/1000);}rec.confirmedSignals.push(sig);payload.events.push({at:now,symbol:s,event:'CONFIRMED_CREATED',signalId:sig.signalId,signalAt:now,firstSmartAt:sig.firstSmartAt||null,smartToConfirmedSec:sig.smartToConfirmedSec??null,repeatClass:sig.repeatClass,version:STRATEGY_VERSION});}
   r.signalId=sig.signalId;r.confirmedAt=sig.confirmedAt;r.signalAgeSec=Math.max(0,(Date.parse(now)-Date.parse(sig.confirmedAt))/1000);r.aiShadow=sig.aiShadow;r.repeatClass=sig.repeatClass;sig.lastConfirmedSeenAt=now;sig.staleMeasurement={mode:'MEASUREMENT_ONLY',signalAgeSec:r.signalAgeSec,bucket:r.signalAgeSec<=120?'<=2m':r.signalAgeSec<=300?'2-5m':'>5m',over5m:r.signalAgeSec>300};}
  rec.lastSeenAt=now;rec.lastState=state;rec.lastPrice=Number(r.price||0);payload.signals[s]=rec;}
 payload.events=payload.events.slice(-4000);payload.updatedAt=now;await store.setJSON(key,payload);await store.setJSON('signal-history-latest',payload);await indexSession(store,dateKey,now);
}
