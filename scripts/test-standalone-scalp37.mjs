import assert from 'node:assert/strict';
import {SCALP_PATTERN_IDS37,detectIndependentScalpPatterns37} from '../netlify/functions/lib/scalp-pattern-engine37.mjs';
import {runStandaloneScalp37,scalpStateKey37,scalpAuditKey37,SCALP_STANDALONE_SCHEMA} from '../netlify/functions/lib/scalp-standalone37.mjs';
import {evaluateScalpEvidence37,publishScalpResearch37,scalpResearchKey37} from '../netlify/functions/lib/scalp-agent-review37.mjs';
import {scalpCycle37,scalpFreshQuote37,scalpPolicy37} from '../netlify/functions/lib/ai-scalp-paper37.mjs';
import {buildEvidence} from '../netlify/functions/lib/research-openai37.mjs';
const day='2026-11-05';let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS SCALP-STANDALONE '+name)};
const mstr=m=>`${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const bar=(m,base=100,volume=20000)=>({datetime:mstr(m),open:base-.04,high:base+.15,low:base-.12,close:base,volume});
const rows=Array.from({length:46},(_,i)=>bar(570+i,100+i*.012,i===45?100000:25000));
const f={barTime:rows.at(-1).datetime,minute:615,barCount:46,price:101,atr:.32,atrPct:.31,
 vwap:100.1,ema9:100.5,ema21:100.2,high:101.2,low:100.7,priorClose:100.2,priorLow:100.1,
 openingDollarVolume:1500000,volumeRatio:2.1,green:true,closePosition:.9,momentum3Pct:.45,momentum5Pct:.6,relativeStrengthPct:.9};
const market={regime:'TREND_UP_NORMAL_VOL_LIQUID',confidence:.8};const policy={entryMinMinute:590,entryMaxMinute:885};
await test('12 distinct bounded OHLCV scalp patterns, no order side effects',()=>{
 assert.equal(SCALP_PATTERN_IDS37.length,12);assert.equal(new Set(SCALP_PATTERN_IDS37).size,12);
 const r=detectIndependentScalpPatterns37({features:f,rows,market,policy});
 assert(r.patterns.some(x=>x.type==='MOMENTUM_SCALP'),JSON.stringify(r));
 assert(r.patterns.every(x=>x.canSendOrders===false));
});
await test('all 12 scalp patterns have an executable detector on synthetic completed candles',()=>{
 const table=Array.from({length:45},(_,i)=>bar(570+i,100,25000));
 const barNow={...bar(615,100.4,100000),open:99.95,low:99.7,high:100.5,close:100.4};
 const fBase={...f,barTime:barNow.datetime,minute:615,price:100.4,vwap:100,ema9:100.1,ema21:99.8,
  relativeStrengthPct:.9,momentum5Pct:.6,momentum3Pct:.5,volumeRatio:2.1,high:100.5,low:99.7};
 const outcome=detectIndependentScalpPatterns37({features:fBase,rows:[...table,barNow],market,policy});
 const later={...barNow,datetime:mstr(755)};
 const lateOutcome=detectIndependentScalpPatterns37({features:{...fBase,barTime:later.datetime,minute:755},
  rows:[...table,later],market,policy});
 const observed=new Set([...outcome.patterns,...lateOutcome.patterns].map(p=>p.type));
 for(const type of SCALP_PATTERN_IDS37)assert(observed.has(type),`Unreachable pattern: ${type}`);
 assert.equal(observed.size,12);
});
await test('bad bar provenance and missing features fail closed',()=>{
 assert.equal(detectIndependentScalpPatterns37({features:f,rows:[...rows,{...rows.at(-1),close:NaN}],market,policy}).patterns.length,0);
 assert.equal(detectIndependentScalpPatterns37({features:{...f,barTime:mstr(777)},rows,market,policy}).reason,'SCALP_FEATURE_BAR_MISMATCH');
 assert.equal(detectIndependentScalpPatterns37({features:null,rows,market,policy}).patterns.length,0);
});
await test('down market can evaluate recovery pattern, but not momentum by default',()=>{
 const recoveryRows=rows.map(x=>({...x}));const prev=recoveryRows.at(-2);prev.close=100.3;
 const last=recoveryRows.at(-1);last.open=99.6;last.low=99.0;last.close=101.2;last.high=101.4;
 const fc={...f,barTime:last.datetime,price:last.close,high:last.high,low:last.low,momentum3Pct:.5};
 const x=detectIndependentScalpPatterns37({features:fc,rows:recoveryRows,market:{regime:'TREND_DOWN_HIGH_VOL_LIQUID',confidence:.9},policy});
 assert(x.patterns.every(p=>p.type!=='MOMENTUM_SCALP'));
});
function memStore(){const db=new Map();return {db,async get(k){return db.get(k)||null},async setJSON(k,v,opts={}){if(opts.onlyIfNew&&db.has(k))return {modified:false};db.set(k,structuredClone(v));return {modified:true,etag:'"test-etag"'}}}}
const store=memStore();const env={ALPACA_API_KEY_ID:'fake',ALPACA_API_SECRET_KEY:'fake',DT37_SCALP_STANDALONE_ENABLED:'true'};
const now=new Date('2026-11-05T15:16:30.000Z'); // 10:16:30 EST
const universe={eligibleSymbols:['AAA','BBB','CCC'],source:'MOCK_VERIFIED'};
const sharia={symbols:['AAA','BBB','CCC'],source:'MOCK_VERIFIED'};
const spy=rows.map((x,i)=>({...x,open:500+i*.004,close:500+i*.004,high:500.1+i*.004,low:499.9+i*.004}));
let feedCalls=0;
const feedProvider=async(symbols)=>{feedCalls++;return {bars:{AAA:rows,BBB:rows,CCC:rows,SPY:spy},quotes:{},errors:[]}};
const base={store,now,decisionNow:now,env,feedProvider,shariaProvider:async()=>sharia,universeProvider:async()=>universe};
await test('opt-in off does not call provider, make writes, or read AI scanner',async()=>{
 const x=await runStandaloneScalp37({...base,env:{...env,DT37_SCALP_STANDALONE_ENABLED:'false'}});
 assert.equal(x.status,'DISABLED_NO_COSTLY_FEEDS');assert.equal(feedCalls,0);assert.equal(store.db.size,0);
});
await test('legacy scalp conflict fails closed without double paper trading',async()=>{
 const x=await runStandaloneScalp37({...base,env:{...env,DT37_AI_SCALP_PAPER_ENABLED:'true'}});
 assert.equal(x.status,'LEGACY_SCALP_CONFLICT_FAIL_CLOSED');assert.equal(feedCalls,0);
});
await test('missing provider keys stops before market API call',async()=>{
 const x=await runStandaloneScalp37({...base,env:{DT37_SCALP_STANDALONE_ENABLED:'true'}});
 assert.equal(x.status,'MISSING_ALPACA_KEYS_NO_FEEDS');assert.equal(feedCalls,0);
});
await test('one independently persisted minute; own audit, state and summary',async()=>{
 const x=await runStandaloneScalp37(base);
 assert(['RECORDED','DEGRADED'].includes(x.status),JSON.stringify(x));
 const state=await store.get(scalpStateKey37(day));assert.equal(state.schema,SCALP_STANDALONE_SCHEMA);
 assert.equal(state.cycles,1);assert.equal(state.book.schemaVersion,'3.7-SCALP-PAPER-1');
 assert.equal(state.book.status,'ACTIVE_INDEPENDENT_PAPER');
 const audit=await store.get(scalpAuditKey37(day,616));assert.equal(audit.status,'RECORDED');
 assert.equal(audit.events.length,3);assert.equal(audit.events[0].at,now.toISOString());
 assert.equal(store.db.has(`ai-parallel-state-${day}`),false);
 assert.equal(feedCalls,1);
});
await test('same minute idempotence prevents duplicated state, entries and API work',async()=>{
 const x=await runStandaloneScalp37(base);assert.equal(x.status,'DUPLICATE_MINUTE_SKIPPED');
 assert.equal(feedCalls,1);assert.equal((await store.get(scalpStateKey37(day))).cycles,1);
});
await test('atomic minute claim blocks concurrent duplicate data fetches',async()=>{
 const st=memStore();let calls=0;
 const c={...base,store:st,feedProvider:async()=>{calls++;return {bars:{AAA:rows,BBB:rows,CCC:rows,SPY:spy},quotes:{},errors:[]}}};
 const [a,b]=await Promise.all([runStandaloneScalp37(c),runStandaloneScalp37(c)]);
 assert.deepEqual([a.status,b.status].sort(),['DUPLICATE_MINUTE_CLAIMED','RECORDED'].sort());
 assert.equal(calls,1);assert.equal((await st.get(scalpStateKey37(day))).cycles,1);
});
await test('phantom conditional-write success without ETag never starts paid market feed',async()=>{
 let calls=0;const broken=memStore();const original=broken.setJSON;
 broken.setJSON=async(k,v,opts={})=>opts.onlyIfNew?{modified:true,etag:''}:original(k,v,opts);
 const r=await runStandaloneScalp37({...base,store:broken,feedProvider:async()=>{calls++;return feedProvider();}});
 assert.equal(r.status,'FAILED');assert.equal(r.reason,'MINUTE_CLAIM_UNVERIFIED_NO_ETAG');
 assert.equal(calls,0);assert.equal(await broken.get(scalpStateKey37(day)),null);
});
await test('data fetch crossing minute boundary fails without duplicating next-minute decisions',async()=>{
 const st=memStore(),late=new Date('2026-11-05T15:17:01Z');
 const x=await runStandaloneScalp37({...base,store:st,decisionNow:late});
 assert.equal(x.status,'FAILED');assert.equal(x.reason,'FEED_OVERRAN_CLAIMED_MINUTE');
 assert.equal((await st.get(scalpAuditKey37(day,616))).status,'FAILED');
 assert.equal(await st.get(scalpStateKey37(day)),null);
});
await test('missing benchmark fail closed, cannot count as zero opportunities',async()=>{
 const st=memStore();const x=await runStandaloneScalp37({...base,store:st,feedProvider:async()=>({bars:{SPY:[]},errors:[]})});
 assert.equal(x.status,'FAILED');assert.equal(x.reason,'SPY_BARS_MISSING');
 assert.equal((await st.get(scalpAuditKey37(day,616))).status,'FAILED');
 assert.equal(await st.get(scalpStateKey37(day)),null);
});
await test('all candidate bars missing is FAILED, never a fabricated successful zero-opportunity scan',async()=>{
 const st=memStore();const x=await runStandaloneScalp37({...base,store:st,
  feedProvider:async()=>({bars:{SPY:spy},quotes:{},errors:[]})});
 assert.equal(x.status,'FAILED');assert.equal(x.reason,'NO_VALID_SCALP_CANDIDATE_BARS');
 assert.equal((await st.get(scalpAuditKey37(day,616))).status,'FAILED');
 assert.equal(await st.get(scalpStateKey37(day)),null);
});
await test('unusable same-day benchmark bars is FAILED, not RECORDED',async()=>{
 const st=memStore();const x=await runStandaloneScalp37({...base,store:st,
  feedProvider:async()=>({bars:{SPY:spy.map(x=>({...x,datetime:x.datetime.replace(day,'2026-11-04')})),AAA:rows,BBB:rows,CCC:rows},quotes:{},errors:[]})});
 assert.equal(x.status,'FAILED');assert.equal(x.reason,'NO_COMPLETED_SPY_BARS');
 assert.equal((await st.get(scalpAuditKey37(day,616))).status,'FAILED');
});
await test('research agent reads own scalp, deduplicates results and refuses automatic approval',async()=>{
 const state=await store.get(scalpStateKey37(day));
 state.book.closedOutcomes=[{id:'SC:1',setupType:'MOMENTUM_SCALP',status:'CLOSED',netUsd:-2.5,outcome:'SCALP_STOP',closedAt:'2026-11-05 10:12:00'},
 {id:'SC:1',setupType:'MOMENTUM_SCALP',status:'CLOSED',netUsd:-2.5,outcome:'SCALP_STOP',closedAt:'2026-11-05 10:12:00'},
 {id:'SC:2',setupType:'VWAP_RECLAIM_SCALP',status:'UNPRICED_AT_CLOSE',netUsd:null}];
 state.gateCounts={SCALP_QUOTE_FRESH:18};await store.setJSON(scalpStateKey37(day),state);
 const r=evaluateScalpEvidence37(state,{day});
 assert.equal(r.summary.closedUnique,2);assert.equal(r.summary.pricedUnique,1);assert.equal(r.summary.bySetup.MOMENTUM_SCALP.netUsd,-2.5);
 assert(r.recommendations.some(x=>x.area==='SCALP_ENTRY_GATES'));
 assert(r.recommendations.every(x=>x.automaticApply===false&&x.brokerTradingAllowed===false));
 const done=await publishScalpResearch37(store,day);assert.equal(done.status,'LOCAL_EVIDENCE_REVIEW');
 assert.equal((await store.get(scalpResearchKey37(day))).source.lastRun,state.updatedAt);
});
await test('no recorded state is NOT_RECORDED, not a zero-PnL report',async()=>{
 const x=evaluateScalpEvidence37(null,{day});assert.equal(x.status,'NOT_RECORDED');assert.equal(x.summary,null);
});

await test('complete standalone paper lifecycle: detected -> pending -> entry -> target exit -> persisted outcome',async()=>{
 const benchmark={regime:'TREND_UP_NORMAL_VOL_LIQUID',confidence:.95};
 const baseRows=Array.from({length:40},(_,i)=>bar(570+i,100,i===39?100000:25000));
 const feature=m=>({day,barTime:mstr(m),minute:m,barCount:40,price:100,high:100.10,low:99.90,
  priorClose:99.5,priorLow:99.5,atr:.35,vwap:99.3,ema9:99.7,ema21:99.1,
  openingDollarVolume:1500000,volumeRatio:1.9,green:true,closePosition:.9,momentum3Pct:.45,
  momentum5Pct:.45,relativeStrengthPct:.35});
 const stamp=m=>new Date(Date.UTC(2026,10,5,Math.floor(m/60)+5,m%60,3));
 const step=(minute,barRows,features,previous,quote)=>scalpCycle37({day,now:stamp(minute),minute,
  candidates:['AAA'],barMap:{AAA:barRows},features:{AAA:features},quotes:{AAA:quote},approved:['AAA'],
  market:benchmark,previous,enabled:true,patternMode:'STANDALONE'});
 const pending=step(610,baseRows,feature(609),null);
 assert.equal(pending.state.records.AAA.status,'PENDING');
 assert.equal(pending.events[0].lifecycle,'PENDING_CREATED');
 const signalBar=bar(610,100.16,120000);
 const quote={source:'Alpaca IEX latest quote',bid:100.15,ask:100.16,bidSize:90,askSize:90,
  timestamp:new Date(stamp(611).getTime()-1000).toISOString()};
 const entry=step(611,[...baseRows,signalBar],{...feature(610),price:100.16,high:100.28,low:100.02},pending.state,quote);
 assert.equal(entry.state.records.AAA.status,'OPEN',JSON.stringify(entry.events));
 assert.equal(entry.events[0].lifecycle,'PAPER_ENTRY');
 const target=entry.state.records.AAA.position.target;
 const lastBar={...bar(611,target-.04),high:target+.08,low:100.11};
 const exit=step(612,[...baseRows,signalBar,lastBar],{...feature(611),price:lastBar.close,high:lastBar.high,low:lastBar.low},entry.state,quote);
 assert.equal(exit.state.records.AAA.status,'CLOSED');
 assert.equal(exit.events[0].lifecycle,'PAPER_EXIT');
 assert.equal(exit.state.closedOutcomes.length,1);
 assert.equal(exit.state.closedOutcomes[0].outcome,'SCALP_TARGET');
 assert(Number.isFinite(exit.state.closedOutcomes[0].netUsd));
 assert.equal(step(613,[...baseRows,signalBar,lastBar],feature(611),exit.state,quote).state.closedOutcomes.length,1);
});
await test('quote validation uses decision-time, not pre-fetch timestamp',()=>{
 const st=new Date('2026-11-05T15:16:30.000Z'),done=new Date('2026-11-05T15:16:34.000Z');
 const quote={source:'Alpaca IEX latest quote',bid:100,ask:100.03,bidSize:100,askSize:100,timestamp:'2026-11-05T15:16:31.000Z'};
 assert.equal(scalpFreshQuote37(quote,st,scalpPolicy37(market)).passed,false);
 assert.equal(scalpFreshQuote37(quote,done,scalpPolicy37(market)).passed,true);
});
await test('preclose scan stops one hour before normal US close without provider calls',async()=>{
 const privateStore=memStore(),x=await runStandaloneScalp37({...base,store:privateStore,now:new Date('2026-11-05T20:01:00Z')});
 assert.equal(x.status,'OUTSIDE_SCALP_WINDOW');assert.equal(privateStore.db.size,0);
});
await test('NYSE early-close day stops an hour before the 13:00 New York close',async()=>{
 const st=memStore(),r=await runStandaloneScalp37({...base,store:st,
  now:new Date('2026-11-27T17:01:00Z'),decisionNow:new Date('2026-11-27T17:01:00Z')});
 assert.equal(r.status,'OUTSIDE_SCALP_WINDOW');assert.equal(st.db.size,0);
});
await test('Agent paid evidence receives independently reviewed scalp outcomes without cross-counting',()=>{
 const report=evaluateScalpEvidence37(store.db.get(scalpStateKey37(day)),{day});
 const data=buildEvidence({day,aiState:{updatedAt:'2026-11-05T21:00:00Z',records:{},cycles:390,cumulativeScanned:[]},
   scalpReport:report});
 assert.equal(data.standaloneScalp.status,'LOCAL_EVIDENCE_REVIEW');
 assert.equal(data.standaloneScalp.pricedUnique,1);
 assert.equal(data.ai.paperOutcomesWithNetUsd,0);
 assert.equal(data.standaloneScalp.recommendations[0].automaticApply,false);
 const missing=buildEvidence({day,aiState:{updatedAt:'2026-11-05T21:00:00Z',records:{}},scalpReport:null});
 assert.equal(missing.standaloneScalp,'NOT_RECORDED_NO_ASSUMED_ZERO');
});
await test('UI has a separate agent-owned scalp area and read-only API, not AI panel section',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert(html.includes('id="dt37StandaloneScalpSection"'));
 assert(!html.includes('id="aiScalp37Summary"'));
 const handler=readFileSync(new URL('../netlify/functions/scalp-paper37.mjs',import.meta.url),'utf8');
 assert(handler.includes("path:'/api/scalp-paper'"));
 assert(handler.includes("if(req.method!=='GET')"));
});
console.log(`DT37_STANDALONE_SCALP_TESTS_PASS ${passed}/${passed}`);
