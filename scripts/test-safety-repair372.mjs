import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiScan372} from '../netlify/functions/ai-parallel-scan.mjs';
import {memoryStore372} from './lib/memory-store372.mjs';
import {marketTimestamp372} from '../netlify/functions/lib/market-time372.mjs';
import {tradeEconomics372,sizePaperPosition372} from '../netlify/functions/lib/market-economics372.mjs';
import {buildAiInternalReport372} from '../netlify/functions/lib/ai-internal-report372.mjs';
import {evaluateIndependentAi,adaptiveAiPolicy} from '../netlify/functions/lib/ai-parallel36.mjs';
import {reviewDecision372} from '../netlify/functions/lib/ai-decision-review372.mjs';
import {inspectResearchCandidates36,evaluateLiveResearch36} from '../netlify/functions/lib/research-live36.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
const day='2026-11-10',key=`ai-parallel-state-${day}`;
const position={id:'open1',status:'OPEN',entry:100,stop:90,target:110,qty:1,feesUsd:2,
 openedAt:day+'T14:40:00Z',openedBarTime:day+' 09:40:00',lastEvaluatedBarTime:day+' 09:40:00',shadow:{}};
const seed={dateKey:day,records:{ABC:{symbol:'ABC',state:'AI_PAPER_CONFIRMED',position}},lastMinuteProcessed:599,cycles:4};
function setup(state=seed){
 const store=memoryStore372({[key]:state});let at=day+'T15:00:05Z',feeds=0;
 const handler=createAiScan372({getStoreFn:()=>store,nowFn:()=>new Date(at),
  shariaFn:async()=>({symbols:['ABC']}),universeFn:async()=>({eligibleSymbols:['ABC']}),historyFn:async()=>[],
  feedFn:async()=>{feeds++;const p=new Date(at),minute=p.getUTCHours()*60+p.getUTCMinutes()-301;
   const datetime=day+' '+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')+':00';
   const bar={datetime,open:100,high:100.1,low:99.9,close:100,volume:10000};
   return {bars:{ABC:[bar],SPY:[bar]},quotes:{},errors:[]};}});
 return {store,handler,setTime:v=>{at=v},feeds:()=>feeds};
}
process.env.ALPACA_API_KEY_ID='LOCAL_ONLY';process.env.ALPACA_API_SECRET_KEY='LOCAL_ONLY';
test('a transient authoritative-state read error never resets or writes the paper book',async()=>{
 const {store,handler}=setup();let writes=0;
 store.beforeRead=async k=>{if(k===key)throw Error('READ_OUTAGE')};store.beforeSet=async()=>writes++;
 await assert.rejects(handler(),/READ_OUTAGE/);assert.equal(writes,0);assert.equal(store.map.get(key).data.records.ABC.position.id,'open1');
});
test('a false acknowledged state write cannot be reported as a completed cycle',async()=>{
 const x=setup(),real=x.store.setJSON.bind(x.store);
 x.store.setJSON=async(k,v,o)=>k===key&&v.publication372?{modified:true,etag:'phantom'}:real(k,v,o);
 await assert.rejects(x.handler(),/AI_COMMIT_READBACK_NOT_VERIFIED/);
 assert.equal(x.store.map.get(key).data.lastMinuteProcessed,599);
 assert(!x.store.map.has('ai-parallel-audit-2026-11-10-0600'));
});
for(const failingKey of ['ai-parallel-audit-2026-11-10-0600','dt37-research-ledger-ai-2026-11-10-10',`ai-parallel-recommendations-${day}`,'ai-parallel-latest']){
 test('restart recovers durable publication after write outage at '+failingKey,async()=>{
  const x=setup();let fail=true;
  x.store.beforeSet=async k=>{if(k===failingKey&&fail){fail=false;throw Error('INJECTED_WRITE_OUTAGE')}};
  await assert.rejects(x.handler(),/INJECTED_WRITE_OUTAGE/);assert(x.store.map.get(key).data.publication372);
  x.setTime(day+'T15:00:15Z');assert.equal((await x.handler()).status,200);
  assert.equal(x.store.map.get(key).data.lastMinuteProcessed,600);assert(!x.store.map.get(key).data.publication372);
  assert.equal(x.feeds(),1,'resume must publish the original decision without a second data fetch/re-evaluation');
  assert.equal(x.store.map.get('ai-parallel-latest').data.minute,600);
 });
}
test('an older cycle cannot overwrite a newer CAS state or materialized latest',async()=>{
 const x=setup();let release,arrived,blocked=false;
 const wait=new Promise(r=>release=r),atWrite=new Promise(r=>arrived=r);
 x.store.beforeSet=async(k,v)=>{if(k===key&&v.publication372?.minute===600&&!blocked){blocked=true;arrived();await wait;}};
 const first=x.handler();await atWrite;x.setTime(day+'T15:01:05Z');await x.handler();release();
 await assert.rejects(first,/AI_STATE_CHANGED_RETRY_FROM_HEAD/);
 assert.equal(x.store.map.get(key).data.lastMinuteProcessed,601);assert.equal(x.store.map.get('ai-parallel-latest').data.minute,601);
 assert.equal(x.store.map.get(key).data.records.ABC.position.id,'open1');
});
test('16:00 close is archived, indexed and saved as CLOSED with no new entry',async()=>{
 const x=setup();x.setTime(day+'T21:00:05Z');assert.equal((await x.handler()).status,200);
 assert.equal(x.store.map.get(key).data.records.ABC.position.status,'CLOSED');
 assert(x.store.map.has('ai-parallel-audit-2026-11-10-0960'));
 assert(x.store.map.get('dt37-research-ledger-ai-2026-11-10-15').data.minutes['0960']);
});
test('the early-close 13:00 follow-up is also durably saved without opening a new trade',async()=>{
 const d='2026-11-27',key=`ai-parallel-state-${d}`;
 const p={...position,openedAt:d+'T17:00:00Z',openedBarTime:d+' 12:00:00',lastEvaluatedBarTime:d+' 12:00:00'};
 const store=memoryStore372({[key]:{dateKey:d,lastMinuteProcessed:775,records:{ABC:{symbol:'ABC',position:p}}}});
 const bar={datetime:d+' 12:59:00',open:100,high:100.1,low:99.9,close:100,volume:1000};
 const handler=createAiScan372({getStoreFn:()=>store,nowFn:()=>new Date(d+'T18:00:05Z'),feedFn:async()=>({bars:{ABC:[bar],SPY:[bar]},quotes:{},errors:[]})});
 await handler();assert.equal(store.map.get(key).data.records.ABC.position.status,'CLOSED');
 assert(store.map.has('ai-parallel-audit-'+d+'-0780'));
});
test('New York stored times reject future closes in both EST and EDT; bad dates do not count',()=>{
 assert.equal(marketTimestamp372('2026-11-10 11:00:00'),Date.parse('2026-11-10T16:00:00Z'));
 assert.equal(marketTimestamp372('2026-07-02 11:00:00'),Date.parse('2026-07-02T15:00:00Z'));
 assert.equal(marketTimestamp372('2026-02-30 10:00:00'),null);assert.equal(marketTimestamp372('invalid'),null);
 assert.equal(marketTimestamp372('2026-02-30T15:00:00Z'),null);
 const r=buildAiInternalReport372({day,now:new Date(day+'T15:00:00Z'),history:[{id:'future',status:'CLOSED',netUsd:100,closedAt:day+' 11:00:00'}]});
 assert.equal(r.outcomes.uniqueClosed,0);
});
test('strict reward floor rejects equality, missing prices, and gross wins that fees/spread/slippage erase',()=>{
 for(const args of [{entry:100,stop:99,target:101,qty:10,feesUsd:0,bid:100,ask:100,slippageBps:0},
  {entry:100,stop:99,target:101.2,qty:5,feesUsd:2,bid:99.98,ask:100}])assert.equal(tradeEconomics372(args).acceptable,false);
 assert.equal(tradeEconomics372({entry:100,stop:99,target:104,qty:5,feesUsd:2,bid:99.98,ask:100}).acceptable,true);
 assert.equal(tradeEconomics372({entry:100,stop:99,target:104,qty:5}).acceptable,false);
});
test('position size keeps the full modeled loss including spread/slippage/fees inside the cash risk budget',()=>{
 for(const spread of [.001,.02,.10]){
  const q={entry:100,stop:99,bid:100-spread,ask:100,capitalUsd:1000,riskBudgetUsd:7.5,feesUsd:2};
  const qty=sizePaperPosition372(q),e=tradeEconomics372({...q,target:104,qty});
  assert(e.netLossUsd<=7.5+1e-10);assert(qty*q.entry+e.totalCostUsd<=1000+1e-10);
 }
});
const d='2026-10-30',stamp=m=>`${d} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const clock=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60+1,3));
function fixture({resistance=false,wider=false}={}){
 const stock=[],spy=[];for(let m=570;m<=696;m++){
  let price=m<585?100:m<690?100.06+(m-585)*.005:100.58+(m-690)*.105;
  const b={datetime:stamp(m),open:price-.08,high:price+.06,low:price-.20,close:price,volume:m===695?18000:4500};
  if(wider&&m>=676&&m<=692)b.low-=.20;
  if(resistance&&m===600)b.high=104;
  stock.push(b);spy.push({...b,open:100,high:100.02,low:99.98,close:100,volume:10000});
 }return {stock,spy};
}
test('the original 0.847 net-reward AI fixture is now rejected instead of confirmed',()=>{
 const {stock,spy}=fixture();const signal=evaluateIndependentAi('AI1',stock.slice(0,-1),spy.slice(0,-1),null,{now:clock(695),approved:true});
 const q={bid:101.185,ask:101.19,bidSize:100,askSize:110,source:'Alpaca IEX latest quote',timestamp:clock(696).toISOString()};
 const r=evaluateIndependentAi('AI1',stock,spy,q,{now:clock(696),approved:true,prior:{pending:signal.pending}});
 assert.notEqual(r.state,'AI_PAPER_CONFIRMED');assert(r.tradeEvaluation.alternatives.every(x=>!x.economics.acceptable));
});
test('AI evaluates an executable Early Retest alternative after the original breakout plan fails',()=>{
 const {stock,spy}=fixture({resistance:true,wider:true});
 const policy=adaptiveAiPolicy([],[],695),base={day:d,signalMinute:695,signalBarTime:stamp(695),
  validUntil:699,trigger:102.5,low3:100.695,atr:.45,hod:104,type:'BREAKOUT_CONTINUATION',model:'HOD',
  setupPrice:101.105,support:100.5,policyAtSignal:policy,originGate:'ADAPTIVE_SESSION'};
 const q={bid:101.185,ask:101.19,bidSize:100,askSize:110,source:'Alpaca IEX latest quote',timestamp:clock(696).toISOString()};
 const r=evaluateIndependentAi('AI1',stock,spy,q,{now:clock(696),approved:true,prior:{pending:{...base,alternatives:[base,{...base,type:'EARLY_RETEST',model:'VWAP'}]}}});
 assert.equal(r.state,'AI_PAPER_CONFIRMED',JSON.stringify(r.checks.execution));assert.equal(r.position.setupType,'EARLY_RETEST');
 assert(r.position.entry<base.trigger);assert(r.position.costModel.netGainUsd>r.position.costModel.netLossUsd);
 assert(r.tradeEvaluation.alternatives.some(p=>p.type==='BREAKOUT_CONTINUATION'&&!p.checks.every(c=>c.passed)));
 assert(r.tradeEvaluation.alternatives.some(p=>p.type==='EARLY_RETEST'&&p.selected));
});
test('primary retest exposes independent paths, exact original trigger and bounded separate zone',()=>{
 const f=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
 const day='2026-09-04',minute=631,now=new Date(day+'T14:32:04Z');
 const bars=s=>f.bars[day+'|'+s].filter(x=>x[0]<=minute).map(x=>({datetime:`${day} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
 const candidates=inspectResearchCandidates36(bars('KLAC'),now,{allowHistorical:true}).found;
 assert(candidates.some(x=>x.entryPath==='EARLY_RETEST'));assert(candidates.some(x=>x.entryPath==='BREAKOUT_ORIGINAL'));
 const last=candidates.filter(x=>x.minute===631&&x.entryPath==='EARLY_RETEST')[0];
 const ask=last.signalClose,q={bid:ask-.001,ask,bidSize:100,askSize:100,timestamp:now.toISOString(),source:'Alpaca IEX latest quote'};
 const r=evaluateLiveResearch36('KLAC',bars('KLAC'),bars('SPY'),q,{now,allowHistorical:true,shariaApproved:true});
 assert.equal(r.state,'CONFIRMED');assert.equal(r.entryPath,'EARLY_RETEST');assert(ask<last.trigger);
 const original=r.comparedPlans.find(p=>p.minute===631&&p.entryPath==='BREAKOUT_ORIGINAL');
 assert(original.checks.some(c=>c.gate==='ask_above_breakout_trigger'&&!c.passed));
 assert(r.comparedPlans.some(p=>p.entryPath==='EARLY_RETEST'&&p.checks.some(c=>c.gate==='early_retest_ask_after_completed_confirmation'&&c.passed)));
 const zone=r.comparedPlans.find(p=>p.minute===631&&p.entryPath==='TRIGGER_ZONE');assert(zone);
 const floor=zone.checks.find(c=>c.gate==='ask_near_frozen_trigger_with_tiny_tolerance').threshold;
 assert(floor>=last.trigger-.01);assert(floor>=last.trigger-(q.ask-q.bid)*.25-1e-10);
 for(const p of r.comparedPlans)if(p.selected)assert(p.economics.netGainUsd>p.economics.netLossUsd);
});
test('rejected followthrough and alternative outcomes keep facts separate from causal assumptions',()=>{
 const previous={rejectionStudy372:{id:'prior',barTime:day+' 09:59:00',referencePrice:100,reason:'SPREAD_TOO_WIDE'}};
 const decision={state:'SMART',reason:'SPREAD_TOO_WIDE',features:{price:101,barTime:day+' 10:00:00'},decisionTrace:{allFailedChecks:[{gate:'spread',observed:30,threshold:12}]}};
 const r=reviewDecision372({symbol:'ABC',day,minute:601,now:new Date(day+'T15:01:05Z'),decision,previous,
  bars:[{datetime:day+' 10:00:00',open:100,high:102,low:99,close:101,volume:10000}]});
 assert(r.rejectionStudy372.mfePct>0);assert.equal(r.decisionReview372.facts[0].classification,'FACT');
 assert.equal(r.decisionReview372.hypotheses[0].classification,'ASSUMPTION');assert.equal(r.decisionReview372.causalConclusion.classification,'UNVERIFIED');
});
test('distinct rejected setups are all observed, matured once and archived without an unbounded state history',()=>{
 const decision=m=>({state:'SMART',reason:'NET_REWARD_NOT_GREATER_THAN_RISK',pending:{signalMinute:m,type:'RETEST'},
  features:{price:100,barTime:`${day} 10:${String(m-600).padStart(2,'0')}:00`},decisionTrace:{allFailedChecks:[]}});
 const a=reviewDecision372({symbol:'ABC',day,minute:600,now:new Date(day+'T15:01:05Z'),decision:decision(600),bars:[]});
 const b=reviewDecision372({symbol:'ABC',day,minute:601,now:new Date(day+'T15:02:05Z'),decision:decision(601),previous:a,bars:[]});
 assert.equal(b.rejectionStudies372.length,2);
 const bars=Array.from({length:22},(_,i)=>({datetime:`${day} 10:${String(i).padStart(2,'0')}:00`,open:100,high:102,low:99,close:101,volume:1000}));
 const args={symbol:'ABC',day,minute:622,now:new Date(day+'T15:22:05Z'),decision:{state:'REGULAR',reason:'NO_SETUP'},bars};
 const c=reviewDecision372({...args,previous:b});assert.equal(c.completedRejectionStudies372.length,2);
 assert.equal(c.rejectionTotals372.observedSetups,2);assert.equal(c.rejectionTotals372.positivePriceMfe,2);assert.equal(c.rejectionStudies372.length,0);
 const repeated=reviewDecision372({...args,previous:c});assert.equal(repeated.rejectionTotals372.observedSetups,2);
});
