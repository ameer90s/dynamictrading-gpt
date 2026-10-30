/** Scheduled independent second scanner. Only writes ai-parallel-* keys.
 * Intentionally does NOT send push notifications or brokerage orders.
 */
import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {getShariaUniverse} from './lib/sharia.mjs';
import {getOrBuildSessionUniverse} from './lib/session-universe.mjs';
import {alpacaConfigured} from './lib/alpaca.mjs';
import {fetchAiCycleData} from './lib/ai-parallel-data36.mjs';
import {independentCycle} from './lib/ai-parallel-runner36.mjs';

export default async()=>{
 const now=new Date(),clock=recommendationWindow(now);
 if(!clock.isTradingDay||clock.session!=='REGULAR'||clock.minuteOfDay<570||clock.minuteOfDay>clock.endMinute)return new Response('AI-PARALLEL skipped: outside regular session');
 if(!alpacaConfigured())return new Response('AI-PARALLEL requires configured Alpaca Market Data',{status:503});
 const store=getStore('dynamic-trading');const stateKey=`ai-parallel-state-${clock.dateKey}`;
 const existing=await store.get(stateKey,{type:'json',consistency:'strong'}).catch(()=>null)||{};
 // Compare completed-minute event key: no accidental duplicate outcomes on retried schedules.
 if(existing?.lastMinuteProcessed===clock.minuteOfDay)return new Response('AI-PARALLEL duplicate minute skipped');
 const sharia=await getShariaUniverse(store);if(!sharia.symbols?.length)return new Response('AI-PARALLEL no verified Sharia universe',{status:503});
 const session=await getOrBuildSessionUniverse(store,clock.dateKey,sharia.symbols);
 const allowed=new Set(sharia.symbols),eligible=(session.eligibleSymbols||[]).filter(x=>allowed.has(x));
 if(!eligible.length)return new Response('AI-PARALLEL no price-verified eligible symbols',{status:503});
 // Configured throughput is an infrastructure cap, not a trading threshold.
 const capacity=Math.max(3,Math.min(30,Number(process.env.AI_PARALLEL_CYCLE_CAP)||12));
 const cursor=existing.cursor||0;
 const batch=Array.from({length:Math.min(capacity,eligible.length)},(_,i)=>eligible[(cursor+i)%eligible.length]);
 // Always recheck active AI positions and SMART watches irrespective of rotation.
 const active=Object.values(existing.records||{}).filter(x=>x.state==='SMART'||x.state==='AI_PAPER_CONFIRMED'||x.pending||x.position?.status==='OPEN').map(x=>x.symbol);
 const symbols=[...new Set([...batch,...active])].filter(x=>allowed.has(x)&&eligible.includes(x));
 const feed=await fetchAiCycleData(symbols,now);
 if(!feed.bars.SPY?.length)return new Response('AI-PARALLEL benchmark feed unavailable; fail closed',{status:503});
 const decisionNow=new Date(),decisionMinute=recommendationWindow(decisionNow).minuteOfDay;
 if(existing?.lastMinuteProcessed===decisionMinute)return new Response("AI-PARALLEL same-minute duplicate skipped after data fetch");
 const oldIndex=await store.get('ai-parallel-session-index',{type:'json',consistency:'strong'}).catch(()=>null)||{days:[]};
 const priorSessions=await Promise.all((oldIndex.days||[]).filter(x=>x!==clock.dateKey).slice(0,30).map(x=>store.get(`ai-parallel-state-${x}`,{type:'json',consistency:'strong'}).catch(()=>null)));
 const historical=priorSessions.filter(Boolean).flatMap(x=>x.closedOutcomes||[]).filter(x=>x?.closedAt&&x?.netUsd!=null);
 const primary=await store.get(`signal-history-${clock.dateKey}`,{type:'json',consistency:'strong'}).catch(()=>null);
 const events=(primary?.events||[]).filter(x=>x.state==='CONFIRMED'||x.event==='CONFIRMED_CREATED');
 const primarySignals=Object.values(primary?.signals||{}).flatMap(x=>x.confirmedSignals||[]);
 const scannerOutcomes=Object.values(primary?.signals||{}).flatMap(rec=>(rec.confirmedSignals||[]).map(sig=>({symbol:rec.symbol,day:clock.dateKey,confirmedAt:sig.confirmedAt,finalOutcome:sig.finalOutcome||null,entry:sig.entry,stop:sig.sl,target:sig.t3})));
 const deliveryStats={confirmedCount:primarySignals.length,pushAcceptedCount:primarySignals.filter(x=>x.pushSentAt).length,
   knownPushLatencyMs:primarySignals.map(x=>x.pushLatencyMs).filter(Number.isFinite),
   pushProviderFailures:primarySignals.filter(x=>x.pushProviderFailure).length};
 const coverage={eligible:eligible.length,everScanned:(existing.cumulativeScanned||[]).length,coveragePct:eligible.length?Number(((existing.cumulativeScanned||[]).length/eligible.length*100).toFixed(1)):null,
  perCycleCap:capacity,lastFeedErrors:feed.errors,source:'ALPACA_IEX',feedQuality:feed.errors.length?'DEGRADED':'OK'};
 const result=independentCycle({dateKey:clock.dateKey,now:decisionNow,minute:decisionMinute,universe:eligible,batch,barMap:feed.bars,quotes:feed.quotes,existing,history:historical,scannerEvents:events,coverage,approved:sharia.symbols,deliveryStats,scannerOutcomes,sessionEndMinute:clock.endMinute});
 result.state.cursor=(cursor+batch.length)%eligible.length;result.state.lastMinuteProcessed=decisionMinute;
 // Save complete per-minute audit (no truncation of snapshots) + compact mutable state.
 const minuteKey=`ai-parallel-audit-${clock.dateKey}-${String(decisionMinute).padStart(4,'0')}`;
 await store.setJSON(minuteKey,{...result.audit,feedErrors:feed.errors,recommendations:result.recommendations});
 await store.setJSON(stateKey,result.state);
 await store.setJSON(`ai-parallel-recommendations-${clock.dateKey}`,result.recommendations);
 await store.setJSON('ai-parallel-latest',{dateKey:clock.dateKey,minute:decisionMinute,at:decisionNow.toISOString(),coverage,
  scanned:result.audit.snapshots.length,transitions:result.audit.transitions,closedNew:result.audit.closedNew,adaptivePolicy:result.audit.parameters,
  recommendations:result.recommendations.suggestions,serviceStatus:feed.errors.length?'DEGRADED':'ACTIVE_PAPER_ONLY',
  limits:['NO_BROKER_ORDERS','NO_CALIBRATED_PROFIT_PROBABILITY','IEX_FEED_NOT_FULL_SIP']});
 const days=[clock.dateKey,...(oldIndex.days||[]).filter(x=>x!==clock.dateKey)].slice(0,45);
 await store.setJSON('ai-parallel-session-index',{days,updatedAt:now.toISOString()});
 return new Response(`AI-PARALLEL ${clock.dateKey} ${result.audit.snapshots.length} rows ${result.audit.transitions.length} transitions`);
};
