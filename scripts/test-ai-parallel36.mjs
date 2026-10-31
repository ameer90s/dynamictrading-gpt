import assert from 'node:assert/strict';
import {adaptiveAiPolicy,evaluateIndependentAi,updateAiPaperOutcome,buildAiRecommendations,featureSet} from '../netlify/functions/lib/ai-parallel36.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
import {writeScannerAudit36} from '../netlify/functions/lib/scanner-audit36.mjs';
import {getAiBars,fetchAiCycleData} from '../netlify/functions/lib/ai-parallel-data36.mjs';
import {prepareEvidenceForModel,requestOptionalAiLlmReview} from '../netlify/functions/lib/ai-llm-review36.mjs';

let tests=0;const check=(condition,message)=>{assert.ok(condition,message);tests++;};
const nyBar=(m)=>`2026-10-30 ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const bars=[];for(let m=570;m<=585;m++){let i=m-570,c=100+i*.17;bars.push({datetime:nyBar(m),open:c-.09,high:c+.10+(i===7?2:0),low:c-.20,close:c,volume:i===10?180000:25000+i*1000});}
const spy=bars.map(b=>({...b,open:100,high:100.03,low:99.98,close:100,volume:10000}));
const now=m=>new Date(Date.UTC(2026,9,30,13,Math.floor(m-540)+1,5));
const nowAt=(minute,second=5)=>new Date(Date.UTC(2026,9,30,13,minute-540+1,second));
const sample1=featureSet(bars.slice(0,11).map(x=>({...x,_time:{min:parseInt(x.datetime.slice(11,13))*60+parseInt(x.datetime.slice(14,16))}})),spy.slice(0,11).map(x=>({...x,_time:{min:parseInt(x.datetime.slice(11,13))*60+parseInt(x.datetime.slice(14,16))}})));
const p1=adaptiveAiPolicy([sample1],[],580);
const p2=adaptiveAiPolicy([{...sample1,atrPct:1.8,openingDollarVolume:9000000,momentum5Pct:-.8,benchmarkMovePct:-1.2}],[],580);
check(p1.params.maxSpreadBps!==p2.params.maxSpreadBps,'dynamic spread adapts');
check(p1.params.atrStopMultiple!==p2.params.atrStopMultiple,'dynamic ATR stop adapts');
check(p1.params.momentumMinPct!==p2.params.momentumMinPct,'dynamic momentum adapts');
check(p1.params.openDollarVolumeMin!==p2.params.openDollarVolumeMin,'dynamic discovery liquidity adapts');
const closed=Array.from({length:35},(_,i)=>({netUsd:i%6===0?-5:8,outcome:i%6===0?'STOP':'TARGET',setupType:'EARLY'}));
const pLearn=adaptiveAiPolicy([sample1],closed,580);
check(p1.params.earlyMomentumMinPct!==pLearn.params.earlyMomentumMinPct,'prior completed observations affect AI thresholds');
const b580=bars.slice(0,11),s580=spy.slice(0,11);
const signal=evaluateIndependentAi('TEST',b580,s580,null,{now:nowAt(580),approved:true});
check(signal.state==='SMART'&&signal.pending?.type==='EARLY','independent early signal stored as pending, not immediate entry');
check(signal.position==null,'no fake paper fill without quote');
const nextBar={...bars[11],high:Math.max(bars[11].high,signal.pending.trigger+.10),volume:45000};
const price=signal.pending.trigger+.002;const quote={bid:price-.009,ask:price,bidSize:100,askSize:100,timestamp:new Date(nowAt(581).getTime()-1000).toISOString(),source:'Alpaca IEX latest quote'};
const candidate=evaluateIndependentAi('TEST',[...b580,nextBar],spy.slice(0,12),quote,{now:nowAt(581),prior:{pending:signal.pending},approved:true});
console.log('candidate',candidate.state,candidate.reason,'gates',candidate.checks.execution.filter(x=>!x.passed).map(x=>[x.gate,x.observed,x.threshold]));
check(candidate.position===null||candidate.position?.id,'candidate has either verified paper entry or explicitly no entry');
check(candidate.quote?.bidSize===100&&candidate.quote?.askSize===100,'AI quote audit preserves bid and ask sizes');
const missing=evaluateIndependentAi('TEST',[...b580,nextBar],spy.slice(0,12),null,{now:nowAt(581),prior:{pending:signal.pending},approved:true});
check(missing.state!=='AI_PAPER_CONFIRMED'&&missing.reason!=='AI_INDEPENDENT_ENTRY','no confirmed without level1');
const stale=evaluateIndependentAi('TEST',[...b580,nextBar],spy.slice(0,12),{...quote,timestamp:'2026-10-30T13:00:00Z'},{now:nowAt(581),prior:{pending:signal.pending},approved:true});
check(stale.state!=='AI_PAPER_CONFIRMED','no confirmed when stale quote');
const unapproved=evaluateIndependentAi('TEST',b580,s580,quote,{now:nowAt(580),approved:false});
check(unapproved.state==='REGULAR'&&unapproved.checks.opening.some(x=>x.reason==='UNAPPROVED_SHARIA'&&!x.passed),'Sharia fail closed');
const future={datetime:nyBar(582),open:999,close:999,high:999,low:999,volume:999999};
const before=evaluateIndependentAi('TEST',b580,s580,null,{now:nowAt(580),approved:true});
const after=evaluateIndependentAi('TEST',[...b580,future],s580,null,{now:nowAt(580),approved:true});
check(before.features.price===after.features.price&&JSON.stringify(before.checks)===JSON.stringify(after.checks),'future bars do not alter past decision');
// Outcome engine: hit-before-stop, stop-before-target, uncertain same candle, post-exit shadow.
const makePos=()=>({symbol:'AAA',position:{status:'OPEN',id:'t1',entry:100,stop:99,target:102,qty:10,feesUsd:2,openedBarTime:nyBar(600),lastEvaluatedBarTime:nyBar(600),mfePct:0,maePct:0,shadow:{ATR4:104},shadowHits:{},setupType:'EARLY'}});
const win=updateAiPaperOutcome(makePos(),[{datetime:nyBar(601),high:102.5,low:100,close:102.4}],new Date());
check(win.position.outcome==='TARGET'&&win.position.netUsd===18,'paper target net of fees');
const lose=updateAiPaperOutcome(makePos(),[{datetime:nyBar(601),high:100.3,low:98.9,close:99}],new Date());
check(lose.position.outcome==='STOP'&&lose.position.netUsd===-12,'paper stop net of fees');
const amb=updateAiPaperOutcome(makePos(),[{datetime:nyBar(601),high:103,low:98,close:101}],new Date());
check(amb.position.outcome==='AMBIGUOUS_SAME_BAR'&&amb.position.netUsd===null,'same minute stop/target is ambiguous');
const follow=updateAiPaperOutcome(lose,[{datetime:nyBar(602),high:104.5,low:101,close:103}],new Date());
check(follow.position.shadowHits.ATR4.scope==='AFTER_OFFICIAL_EXIT','shadow records post-exit target');
const rec=buildAiRecommendations({records:[{symbol:'TEST',state:'RESULT_RECORDED',position:win.position,reason:'SPREAD_TOO_WIDE'}],scannerEvents:[],coverage:{coveragePct:45}});
check(rec.suggestions.some(x=>x.area==='DISCOVERY'),'coverage issues generate discovery recommendations');
check(rec.suggestions.some(x=>x.area==='OUTCOMES')||rec.outcomes.comparable===1,'independent results counted');
const stored=new Map();const store={setJSON:async(k,v)=>stored.set(k,v)};
const audit=await writeScannerAudit36(store,'2026-10-30',585,[{symbol:'AA',recommendationState:'WAIT',stateReason:'OPEN_RETURN_LOW',research36:{features:{rsi14:25},openingChecks:[{passed:false,gate:'OPEN_RETURN_LOW'}]}}],{eligibleCount:25,attempted:['AA','BB']});
check(audit.records.length===2&&audit.coverage.missing.includes('BB')&&audit.records[0].openingChecks.length===1&&audit.records.find(x=>x.symbol==='BB')?.reason==='ATTEMPTED_NO_RESULT','base audit includes failed discovery and missing coverage');
const cyc=independentCycle({dateKey:'2026-10-30',now:nowAt(580),minute:580,universe:['TEST'],batch:['TEST'],barMap:{TEST:b580,SPY:s580},approved:['TEST'],quotes:{},existing:{records:{}},history:[]});
check(cyc.audit.snapshots.length===1&&cyc.audit.snapshots[0].checks.opening.length>=7,'AI discovery minute audit includes complete gates and features');
check(cyc.state.records.TEST.pending?.type==='EARLY','AI schedule stores pending independent signal');
check(cyc.audit.parameters.params.pendingBars>=2,'AI policy saved with each snapshot');

// Scheduled-cycle as-of settlement must NEVER score an unfinished minute.
const oldPosition={symbol:'TEST',state:'AI_PAPER_CONFIRMED',reason:'PAPER_TRADE_ACTIVE',position:makePos().position};
const futureHit={datetime:nyBar(581),open:100,high:105,low:98,close:101,volume:100};
// When now=09:41:05, the 09:41 bar is not completed and must not close the paper trade.
const noFutureSettlement=independentCycle({dateKey:'2026-10-30',now:nowAt(580),minute:581,universe:['TEST'],batch:['TEST'],barMap:{TEST:[...b580,futureHit],SPY:[...s580]},approved:['TEST'],quotes:{},existing:{records:{TEST:oldPosition}},history:[]});
check(noFutureSettlement.state.records.TEST.position.status==='OPEN','AI runner ignores unfinished minute for outcome tracking');
// A failed data request is explicitly recorded, rather than silently disappearing.
const failed=independentCycle({dateKey:'2026-10-30',now:nowAt(580),minute:580,universe:['BAD'],batch:['BAD'],barMap:{SPY:s580},approved:['BAD'],existing:{records:{}}});
check(failed.audit.snapshots.length===1&&failed.audit.snapshots[0].reason==='NO_COMPLETED_CANDLES','AI audit records missing bars');
// Isolated Alpaca transport test: no real credentials, deterministic fixture only.
const originalFetch=globalThis.fetch;let requested=[];
try{globalThis.fetch=async(raw)=>{const u=new URL(raw.toString());requested.push(u.pathname);if(u.pathname.endsWith('/quotes/latest'))return {ok:true,json:async()=>({quotes:{TEST:{bp:101,ap:101.01,bs:100,as:100,t:'2026-10-30T13:41:00Z'}}})};return {ok:true,json:async()=>({bars:[{t:'2026-10-30T13:39:00Z',o:101,h:102,l:100,c:101.5,v:35000},{t:'2026-10-29T13:39:00Z',o:101,h:102,l:100,c:101.5,v:35000}]})};};
 const env={ALPACA_API_KEY_ID:'TEST_ONLY',ALPACA_API_SECRET_KEY:'TEST_ONLY'};
 const feed=await fetchAiCycleData(['TEST'],new Date('2026-10-30T13:41:05Z'),env);
 check(feed.bars.TEST.length===1&&feed.bars.SPY.length===1,'live data transport day-filters Alpaca bars');
 check(feed.quotes.TEST.source.startsWith('Alpaca')&&feed.quotes.TEST.ask===101.01,'live data transport parses authentic quote schema');
 check(requested.some(x=>x.includes('SPY'))&&requested.some(x=>x.includes('TEST')),'independent source fetches benchmark and stock');
}finally{globalThis.fetch=originalFetch;}
const ev=prepareEvidenceForModel({dateKey:'2026-10-30',aiState:cyc.state,statistics:cyc.recommendations,coverage:{coveragePct:50}});
const llmOff=await requestOptionalAiLlmReview(ev,{enabled:false});
check(llmOff.status==='DISABLED'&&llmOff.suggestions.length===0,'optional paid AI never runs by default');
const llmMock=await requestOptionalAiLlmReview(ev,{enabled:true,apiKey:'TEST_FAKE',model:'TEST_MODEL',fetchFn:async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({suggestions:[{area:'DISCOVERY',title_ar:'تغطية',evidence_ids:[ev.sourceId],observed_fact_ar:'نصف الكون',hypothesis_ar:'تأخير',experiment_ar:'اختبار',risk_ar:'مخاطر',confidence_qualitative:'LOW'},{area:'DISCOVERY',title_ar:'بدون دليل',evidence_ids:['FAKE'],observed_fact_ar:'غير صالح'}],limitations_ar:'عينة صغيرة'})}]}]})})});
check(llmMock.status==='REVIEW_CREATED_NOT_VALIDATED'&&llmMock.suggestions.length===1,'LLM research rejects ungrounded source IDs');
check(llmMock.suggestions[0].changeApproved===false&&llmMock.canApplyChanges===false,'LLM never approves or implements changes');
console.log(JSON.stringify({passed:true,tests,earlyPending:signal.pending?.type,exampleLaterEntry:candidate.state,candidateBlocker:candidate.reason},null,2));
