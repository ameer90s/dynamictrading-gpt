/** Truly separate scalp PAPER lifecycle: own schedule, own state, own per-minute audit.
 * Does not read ai-parallel-state or invoke the Dynamic AI strategy.
 * Extra Netlify scheduled invocations/provider requests: NOT authorized to deploy.
 */
import {recommendationWindow} from './time.mjs';
import {sessionPlan37} from './trading-session-plan37.mjs';
import {getShariaUniverse} from './sharia.mjs';
import {getOrBuildSessionUniverse} from './session-universe.mjs';
import {fetchAiCycleData} from './ai-parallel-data36.mjs';
import {completedSessionRows} from './research36.mjs';
import {scalpFeatures37,scalpMarket37} from './scalp-features37.mjs';
import {scalpCycle37,scalpSummary37,SCALP37_VERSION} from './ai-scalp-paper37.mjs';
import {SCALP_PATTERN_IDS37} from './scalp-pattern-engine37.mjs';
export const SCALP_STANDALONE_SCHEMA='3.7-STANDALONE-SCALP-1';
export const scalpStateKey37=day=>`dt37-standalone-scalp-state-${day}`;
export const scalpAuditKey37=(day,minute)=>`dt37-standalone-scalp-audit-${day}-${String(minute).padStart(4,'0')}`;
export const scalpLatestKey37='dt37-standalone-scalp-latest';
const read=(store,key)=>store.get(key,{type:'json',consistency:'strong'});
const integer=(v,a,b)=>Math.min(b,Math.max(a,Math.trunc(Number(v)||a)));
export async function runStandaloneScalp37({store,now=new Date(),env=process.env,
 shariaProvider=getShariaUniverse,universeProvider=getOrBuildSessionUniverse,feedProvider=fetchAiCycleData,
 decisionNow=null}={}){
 if(!store)throw Error('SCALP_STORE_REQUIRED');
 const clock=recommendationWindow(now),day=clock.dateKey,minute=clock.minuteOfDay;
 const plan=sessionPlan37(clock),stopAt=plan.discoveryCutoff,followOnly=plan.followupDue;
 if(env.DT37_SCALP_STANDALONE_ENABLED!=='true')return {status:'DISABLED_NO_COSTLY_FEEDS',day};
 if(env.DT37_AI_SCALP_PAPER_ENABLED==='true')return {status:'LEGACY_SCALP_CONFLICT_FAIL_CLOSED',day};
 if(!plan.discovery&&!followOnly)return {status:'OUTSIDE_SCALP_WINDOW',day};
 if(!env.ALPACA_API_KEY_ID||!env.ALPACA_API_SECRET_KEY)return {status:'MISSING_ALPACA_KEYS_NO_FEEDS',day};
 const old=await read(store,scalpStateKey37(day))||null;
 if(old&&old.schema!==SCALP_STANDALONE_SCHEMA)return {status:'INVALID_STANDALONE_STATE_FAIL_CLOSED',day};
 if(followOnly&&!Object.values(old?.book?.records||{}).some(x=>x?.position?.status==='OPEN'))
  return {status:'FOLLOWUP_ONLY_NO_OPEN_POSITIONS_NO_FEEDS',day};
 if(old?.book?.lastMinute===minute)return {status:'DUPLICATE_MINUTE_SKIPPED',day};
 // One atomic Blob claim per planned minute prevents duplicate scheduled/retried
 // invocations from issuing market-data requests or writing competing paper trades.
 // An orphaned IN_PROGRESS claim is an explicit missing minute, never a success.
 let claim;
 try{claim=await store.setJSON(scalpAuditKey37(day,minute),{
   schema:SCALP_STANDALONE_SCHEMA,day,minute,status:'IN_PROGRESS',at:now.toISOString(),
   reason:'SCALP_MINUTE_CLAIMED_NO_RESULT_YET',events:[]},{onlyIfNew:true});}
 catch{return {status:'FAILED',reason:'MINUTE_CLAIM_STORAGE_UNAVAILABLE',day,minute};}
 if(claim?.modified!==true)return {status:'DUPLICATE_MINUTE_CLAIMED',day,minute};
 // Some @netlify/blobs releases have reported false conditional-write success
 // with an empty ETag on provider errors. Fail closed rather than double-fetch.
 if(!claim.etag)return {status:'FAILED',reason:'MINUTE_CLAIM_UNVERIFIED_NO_ETAG',day,minute};
 const sharia=await shariaProvider(store);
 if(!Array.isArray(sharia?.symbols)||!sharia.symbols.length)return persistFailure(store,day,minute,'NO_SHARIA_UNIVERSE');
 const session=await universeProvider(store,day,sharia.symbols);
 const allowed=new Set(sharia.symbols),eligible=(session?.eligibleSymbols||[]).filter(x=>allowed.has(x));
 if(!eligible.length)return persistFailure(store,day,minute,'NO_ELIGIBLE_UNIVERSE');
 // Dedicated cursor: no dependency on the AI scanner's state or score.
 const cap=integer(env.DT37_SCALP_CYCLE_CAP??12,4,12),cursor=Number(old?.cursor||0)%eligible.length;
 const active=Object.values(old?.book?.records||{}).filter(r=>r?.pending||r?.position?.status==='OPEN').map(r=>r.symbol);
 const batch=plan.discovery?Array.from({length:Math.min(cap,eligible.length)},(_,i)=>eligible[(cursor+i)%eligible.length]):[];
 const symbols=[...new Set([...batch,...active])].filter(x=>eligible.includes(x));
 if(!symbols.length)return {status:'NO_ACTIVE_SCALP_POSITIONS',day};
 let feed;
 try{feed=await feedProvider(symbols,now,env,store)}catch(e){return persistFailure(store,day,minute,'FEED_PROVIDER_EXCEPTION');}
 if(!Array.isArray(feed?.bars?.SPY)||feed.bars.SPY.length<3)return persistFailure(store,day,minute,'SPY_BARS_MISSING',feed?.errors||[]);
 // Never feed stale/fictional OHLCV into paper entry logic.
 const evaluatedAt=decisionNow||new Date();
 const evalClock=recommendationWindow(evaluatedAt),decisionMinute=evalClock.minuteOfDay;
 // Never process a next-minute decision with an earlier minute's claim/state.
 // The next scheduled invocation owns the new minute; this one logs a failure.
 if(decisionMinute!==minute)return persistFailure(store,day,minute,'FEED_OVERRAN_CLAIMED_MINUTE',feed.errors||[]);
 if(evalClock.dateKey!==day||(!sessionPlan37(evalClock).discovery&&!sessionPlan37(evalClock).followupDue))
  return persistFailure(store,day,minute,'DECISION_OUTSIDE_SCALP_WINDOW_AFTER_FEED');
 if(old?.book?.lastMinute===decisionMinute)return {status:'DUPLICATE_MINUTE_SKIPPED_AFTER_FEED',day};
 const spy=completedSessionRows(feed.bars.SPY,evaluatedAt);
 if(!spy.length)return persistFailure(store,day,decisionMinute,'NO_COMPLETED_SPY_BARS',feed.errors||[]);
 const featureMap={};for(const symbol of symbols){
  const rows=completedSessionRows(feed.bars?.[symbol]||[],evaluatedAt);
  featureMap[symbol]=scalpFeatures37(rows,spy);
 }
 const validFeatures=Object.values(featureMap).filter(Boolean);
 // Never count a data-outage minute as a successful scan with zero opportunities.
 if(!validFeatures.length)return persistFailure(store,day,decisionMinute,'NO_VALID_SCALP_CANDIDATE_BARS',feed.errors||[]);
 const freshBenchmark=validFeatures.every(x=>
  x.benchmarkLagMinutes!==null&&x.benchmarkLagMinutes>=0&&x.benchmarkLagMinutes<=2);
 if(!freshBenchmark)return persistFailure(store,day,decisionMinute,'BENCHMARK_STALE_OR_MISALIGNED',feed.errors||[]);
 const market=scalpMarket37(Object.values(featureMap).filter(Boolean));
 const scalp=scalpCycle37({day,now:evaluatedAt,minute:decisionMinute,candidates:symbols,barMap:feed.bars,quotes:feed.quotes||{},features:featureMap,
  approved:sharia.symbols,market,previous:old?.book||null,sessionEndMinute:plan.close,
  newEntryCutoffMinute:stopAt-1,baselinePolicy:null,enabled:true,patternMode:'STANDALONE'});
 if(['INVALID_PREVIOUS_STATE_FAIL_CLOSED','DATE_MISMATCH_FAIL_CLOSED','DUPLICATE_MINUTE_REJECTED'].includes(scalp.state.status))
  return persistFailure(store,day,decisionMinute,scalp.state.status);
 // No invented success if provider lost any symbol: preserve explicit errors in immutable audit.
 const errors=feed.errors||[];
 const audit={schema:SCALP_STANDALONE_SCHEMA,day,minute:decisionMinute,at:evaluatedAt.toISOString(),status:errors.length?'DEGRADED':'RECORDED',
  symbols,market,feedErrors:errors,shariaSource:sharia.source||null,events:scalp.events,
  closedNew:scalp.closedNew,summary:scalp.summary,policy:scalp.policy};
 const updateCounters=(oldCounters,values)=>{const out={...(oldCounters||{})};for(const value of values){
  const key=String(value||'UNKNOWN').slice(0,70);out[key]=(out[key]||0)+1;
 }return out;};
 const gateCounts=updateCounters(old?.gateCounts,scalp.events.filter(e=>e.reason).map(e=>e.reason));
 const patternCounts=updateCounters(old?.patternCounts,scalp.events.flatMap(e=>(e.allPatterns||[]).map(p=>p.type)));
 const transitionCounts=updateCounters(old?.transitionCounts,scalp.events.filter(e=>e.eventType!=='OBSERVATION').map(e=>e.eventType+':'+e.to));
 const newState={schema:SCALP_STANDALONE_SCHEMA,day,updatedAt:evaluatedAt.toISOString(),cursor:(cursor+batch.length)%eligible.length,
  gateCounts,patternCounts,transitionCounts,
  book:scalp.state,eligibleCount:eligible.length,distinctSymbols:[...new Set([...(old?.distinctSymbols||[]),...symbols])],
  errorCount:(old?.errorCount||0)+errors.length,cycles:(old?.cycles||0)+1};
 // Audit is written first; a retry without state can overwrite identical minute, not fabricate paper trades.
 await store.setJSON(scalpAuditKey37(day,decisionMinute),audit);
 await store.setJSON(scalpStateKey37(day),newState);
 await store.setJSON(scalpLatestKey37,{schema:SCALP_STANDALONE_SCHEMA,day,updatedAt:evaluatedAt.toISOString(),minute:decisionMinute,
  serviceStatus:audit.status,cycles:newState.cycles,eligibleCount:eligible.length,scannedDistinct:newState.distinctSymbols.length,
  summary:scalp.summary,patternsSupported:SCALP_PATTERN_IDS37.length,closedNew:scalp.closedNew.length,errors:errors.length});
 return {status:audit.status,day,minute:decisionMinute,cycles:newState.cycles,closed:scalp.summary.closed};
}
async function persistFailure(store,day,minute,reason,feedErrors=[]){
 await store.setJSON(scalpAuditKey37(day,minute),{schema:SCALP_STANDALONE_SCHEMA,day,minute,
  at:new Date().toISOString(),status:'FAILED',reason,events:[],feedErrors});
 return {status:'FAILED',reason,day,minute};
}
