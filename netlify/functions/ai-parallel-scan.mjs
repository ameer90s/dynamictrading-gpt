/** Scheduled independent second scanner. Only writes ai-parallel-* keys.
 * Intentionally does NOT send push notifications or brokerage orders.
 */
import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {sessionPlan37} from './lib/trading-session-plan37.mjs';
import {aiOpenSymbols37,followAiOpenPositions37} from './lib/ai-followup37.mjs';
import {getShariaUniverse} from './lib/sharia.mjs';
import {getOrBuildSessionUniverse} from './lib/session-universe.mjs';
import {alpacaConfigured} from './lib/alpaca.mjs';
import {fetchAiCycleData} from './lib/ai-parallel-data36.mjs';
import {independentCycle} from './lib/ai-parallel-runner36.mjs';
import {shariaSnapshotEvidence} from './lib/research-sharia37.mjs';
import {recordResearchMinute} from './lib/research-ledger37.mjs';
import {getPriorAiHistory37} from './lib/ai-prior-history-cache37.mjs';
import {planAiAdaptiveBatch37} from './lib/ai-adaptive-scheduler37.mjs';
import {verifiedAiMinute372} from './lib/ai-audit-hardening372.mjs';
import {loadAiState372,commitAiCycle372} from './lib/ai-state-commit372.mjs';
import {preserveRetiredBooks372} from './lib/retired-paper-archive372.mjs';
import {buildAiInternalReport372} from './lib/ai-internal-report372.mjs';

export function createAiScan372({getStoreFn=getStore,nowFn=()=>new Date(),feedFn=fetchAiCycleData,shariaFn=getShariaUniverse,universeFn=getOrBuildSessionUniverse,historyFn=getPriorAiHistory37}={}){return async()=>{
 const now=nowFn(),clock=recommendationWindow(now),phase=sessionPlan37(clock);
 if(!phase.discovery&&!phase.followupDue)return new Response('AI-PARALLEL skipped: outside scan/follow-up window');
 const store=getStoreFn('dynamic-trading');const stateKey=`ai-parallel-state-${clock.dateKey}`;
 // A read error is an outage, never a missing/empty portfolio. Drain a pending
 // durable publication before making any subsequent trading decision.
 const head=await loadAiState372(store,clock.dateKey);
 const existing=await preserveRetiredBooks372(store,clock.dateKey,head.state);
 if(existing.lastMinuteProcessed>=clock.minuteOfDay)return new Response('AI-PARALLEL already processed');
 if(phase.followupDue){
  const symbols=aiOpenSymbols37(existing);
  if(!symbols.length)return new Response('AI-PARALLEL follow-up: no open paper positions');
  if(existing.lastMinuteProcessed===clock.minuteOfDay)return new Response('AI-PARALLEL duplicate follow-up');
  if(!alpacaConfigured()){await writeAiFailure(store,clock,'FOLLOWUP_ALPACA_UNCONFIGURED',[],null,symbols);return new Response('AI-PARALLEL follow-up: missing feed',{status:503});}
  const feed=await feedFn(symbols,now,process.env,store);
  const decisionNow=nowFn(),decisionClock=recommendationWindow(decisionNow);
  if(decisionClock.dateKey!==clock.dateKey||decisionClock.minuteOfDay!==clock.minuteOfDay){
   await writeAiFailure(store,clock,'FOLLOWUP_OVERRAN_MINUTE',feed.errors, null,symbols);
   return new Response('AI-PARALLEL follow-up minute overrun',{status:503});
  }
  const valid=symbols.filter(s=>Array.isArray(feed.bars?.[s])&&feed.bars[s].length>0);
  if(!valid.length){await writeAiFailure(store,clock,'FOLLOWUP_CANDLES_UNAVAILABLE',feed.errors,null,symbols);return new Response('AI-PARALLEL follow-up: no completed bars',{status:503});}
  const follow=followAiOpenPositions37({state:existing,barMap:feed.bars,now:decisionNow,
   minute:clock.minuteOfDay,closeMinute:phase.close});
  const doc={schemaVersion:'3.7-AI-FOLLOWUP',dateKey:clock.dateKey,minute:clock.minuteOfDay,
   at:decisionNow.toISOString(),cycleStatus:feed.errors?.length?'DEGRADED':'FOLLOWUP_ONLY',
   mode:'OPEN_POSITIONS_NO_DISCOVERY_NO_ENTRY',snapshots:follow.snapshots,
   transitions:[],closedNew:follow.closedNew,feedErrors:feed.errors||[]};
  // Keep the measured discovery coverage for the dashboard, but do not keep
  // stale opportunity suggestions actionable during follow-up-only mode.
  const priorLatest=await store.get('ai-parallel-latest',{type:'json',consistency:'strong'});
  const latest={...(priorLatest||{}),dateKey:clock.dateKey,minute:clock.minuteOfDay,
   at:decisionNow.toISOString(),mode:'FOLLOWUP_ONLY',closedNew:follow.closedNew,
   scanned:valid.length,serviceStatus:doc.cycleStatus,recommendations:[],
   limits:['NO_NEW_ENTRIES_LAST_HOUR','NO_BROKER_ORDERS','PAPER_RESULTS_ONLY']};
  const recommendations=await store.get(`ai-parallel-recommendations-${clock.dateKey}`,{type:'json',consistency:'strong'})||{suggestions:[]};
  recommendations.internalReport=buildAiInternalReport372({day:clock.dateKey,now:decisionNow,
   records:Object.values(follow.state.records||{}),coverage:priorLatest?.coverage,
   reasons:follow.state.reasonCounters,recommendations});
  await commitAiCycle372({store,day:clock.dateKey,minute:clock.minuteOfDay,expectedEtag:head.etag,
   state:follow.state,audit:doc,recommendations,latest});
  return new Response(`AI-PARALLEL follow-up ${valid.length} open positions`);
 }
 if(!alpacaConfigured()){await writeAiFailure(store,clock,'ALPACA_MARKET_DATA_UNCONFIGURED');return new Response('AI-PARALLEL requires configured Alpaca Market Data',{status:503});}
 // Compare completed-minute event key: no accidental duplicate outcomes on retried schedules.
 if(existing?.lastMinuteProcessed===clock.minuteOfDay)return new Response('AI-PARALLEL duplicate minute skipped');
 const sharia=await shariaFn(store);const shariaEvidence=shariaSnapshotEvidence(sharia);
 if(!sharia.symbols?.length){await writeAiFailure(store,clock,'NO_VERIFIED_SHARIA_UNIVERSE',[],shariaEvidence);return new Response('AI-PARALLEL no verified Sharia universe',{status:503});}
 const session=await universeFn(store,clock.dateKey,sharia.symbols);
 const allowed=new Set(sharia.symbols),eligible=(session.eligibleSymbols||[]).filter(x=>allowed.has(x));
 if(!eligible.length){await writeAiFailure(store,clock,'NO_ELIGIBLE_SYMBOLS',[],shariaEvidence);return new Response('AI-PARALLEL no price-verified eligible symbols',{status:503});}
 // Configured throughput is an infrastructure cap, not a trading threshold.
 const capacity=Math.max(3,Math.min(30,Number(process.env.AI_PARALLEL_CYCLE_CAP)||12));
 const cursor=existing.cursor||0;
 const scanPlan=planAiAdaptiveBatch37({eligible,records:existing.records,capacity,now,cursor});
 const batch=scanPlan.batch;
 // Always recheck active AI positions and SMART watches irrespective of rotation.
 const active=Object.values(existing.records||{}).filter(x=>x.state==='SMART'||x.state==='AI_PAPER_CONFIRMED'||x.pending||x.position?.status==='OPEN').map(x=>x.symbol);
 const openSymbols=new Set(Object.values(existing.records||{}).filter(x=>x.position?.status==='OPEN').map(x=>x.symbol));
 const symbols=[...new Set([...batch,...active])].filter(x=>(allowed.has(x)&&eligible.includes(x))||openSymbols.has(x));
 const feed=await feedFn(symbols,now,process.env,store);
 if(!feed.bars.SPY?.length){await writeAiFailure(store,clock,'BENCHMARK_FEED_UNAVAILABLE',feed.errors,shariaEvidence,symbols);return new Response('AI-PARALLEL benchmark feed unavailable; fail closed',{status:503});}
 const decisionNow=nowFn(),decisionClock=recommendationWindow(decisionNow),decisionMinute=decisionClock.minuteOfDay;
 if(decisionClock.dateKey!==clock.dateKey||!sessionPlan37(decisionClock).discovery){
  await writeAiFailure(store,clock,'DISCOVERY_WINDOW_OVERRUN',feed.errors,shariaEvidence,symbols);
  return new Response('AI-PARALLEL discovery window overrun',{status:503});
 }
 if(existing?.lastMinuteProcessed===decisionMinute)return new Response("AI-PARALLEL same-minute duplicate skipped after data fetch");
 const oldIndex=await store.get('ai-parallel-session-index',{type:'json',consistency:'strong'})||{days:[]};
 const historical=await historyFn(store,{day:clock.dateKey,index:oldIndex,now});
 const primary=await store.get(`signal-history-${clock.dateKey}`,{type:'json',consistency:'strong'});
 const events=(primary?.events||[]).filter(x=>x.state==='CONFIRMED'||x.event==='CONFIRMED_CREATED');
 const primarySignals=Object.values(primary?.signals||{}).flatMap(x=>x.confirmedSignals||[]);
 const scannerOutcomes=Object.values(primary?.signals||{}).flatMap(rec=>(rec.confirmedSignals||[]).map(sig=>({symbol:rec.symbol,day:clock.dateKey,confirmedAt:sig.confirmedAt,finalOutcome:sig.finalOutcome||null,entry:sig.entry,stop:sig.sl,target:sig.t3})));
 const deliveryStats={confirmedCount:primarySignals.length,pushAcceptedCount:primarySignals.filter(x=>x.pushSentAt).length,
   knownPushLatencyMs:primarySignals.map(x=>x.pushLatencyMs).filter(Number.isFinite),
   pushProviderFailures:primarySignals.filter(x=>x.pushProviderFailure).length};
 const coverage={eligible:eligible.length,everScanned:(existing.cumulativeScanned||[]).length,coveragePct:eligible.length?Number(((existing.cumulativeScanned||[]).length/eligible.length*100).toFixed(1)):null,
  perCycleCap:capacity,adaptiveScanPlan:scanPlan,lastFeedErrors:feed.errors,source:'ALPACA_IEX',feedQuality:feed.errors.length?'DEGRADED':'OK'};
 const result=independentCycle({dateKey:clock.dateKey,now:decisionNow,minute:decisionMinute,universe:eligible,batch,barMap:feed.bars,quotes:feed.quotes,existing,history:historical,scannerEvents:events,coverage,approved:sharia.symbols,deliveryStats,scannerOutcomes,sessionEndMinute:clock.endMinute});
 result.state.cursor=(cursor+batch.length)%eligible.length;result.state.lastMinuteProcessed=decisionMinute;
 // Save complete per-minute audit (no truncation of snapshots) + compact mutable state.
 const minuteKey=`ai-parallel-audit-${clock.dateKey}-${String(decisionMinute).padStart(4,'0')}`;
 const auditDoc={...result.audit,cycleStatus:feed.errors.length?'DEGRADED':'COMPLETED',
  shariaEvidence,feedErrors:feed.errors,recommendations:result.recommendations};
 const latest={dateKey:clock.dateKey,minute:decisionMinute,at:decisionNow.toISOString(),coverage,
  scanned:result.audit.snapshots.length,transitions:result.audit.transitions,closedNew:result.audit.closedNew,
  lifecycleEvents:result.audit.lifecycleEvents,adaptivePolicy:result.audit.parameters,
  recommendations:result.recommendations.suggestions,
  researchPatterns:{version:result.state.researchPatternCatalog?.version||null,
   newDetected:result.audit.lifecycleEvents.filter(e=>e.kind==='RESEARCH_PATTERN_DETECTED').length,
   newObservedOutcomes:result.audit.lifecycleEvents.filter(e=>e.kind==='RESEARCH_PATTERN_OBSERVED_OUTCOME').length,
   researchOnly:true,paperTradeAuthorization:false},
  serviceStatus:feed.errors.length?'DEGRADED':'ACTIVE_PAPER_ONLY',
  limits:['NO_BROKER_ORDERS','NO_CALIBRATED_PROFIT_PROBABILITY','IEX_FEED_NOT_FULL_SIP']};
 await commitAiCycle372({store,day:clock.dateKey,minute:decisionMinute,expectedEtag:head.etag,
  state:{...result.state,retiredArchive372:existing.retiredArchive372},audit:auditDoc,
  recommendations:result.recommendations,latest});
 return new Response(`AI-PARALLEL ${clock.dateKey} ${result.audit.snapshots.length} rows ${result.audit.transitions.length} transitions`);
};}
export default createAiScan372();

/** Persist handled failure minutes as FAILED, not as silent success or a false zero-signal minute. */
export async function writeAiFailure(store,clock,reason,feedErrors=[],shariaEvidence=null,attemptedSymbols=[]){
 const minute=clock.minuteOfDay,key=`ai-parallel-audit-${clock.dateKey}-${String(minute).padStart(4,'0')}`;
 const prior=await store.get(key,{type:'json',consistency:'strong'});
 if(prior){await recordResearchMinute({store,kind:'ai',day:clock.dateKey,doc:prior});return;}
 const failureDoc={schemaVersion:'3.7-AI-AUDIT',dateKey:clock.dateKey,minute,
  at:new Date().toISOString(),cycleStatus:'FAILED',reason,snapshots:[],transitions:[],closedNew:[],
  attemptedSymbols,shariaEvidence,coverage:{attempted:attemptedSymbols.length,completed:0,missing:attemptedSymbols},feedErrors};
 await verifiedAiMinute372({store,day:clock.dateKey,minute,doc:failureDoc,recordResearchMinute});
}
