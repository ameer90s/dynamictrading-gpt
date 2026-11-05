import assert from 'node:assert/strict';
import {scalpPolicy37,scalpFreshQuote37,detectScalpSetup37,settleScalpPosition37,
  scalpCycle37,scalpSummary37,SCALP37_DEFAULTS} from '../netlify/functions/lib/ai-scalp-paper37.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
const D='2026-10-30';
const dtime=m=>`${D} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const now=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60,3));
const bar=(minute,{o=100,h=100.10,l=99.90,c=100,v=30000}={})=>({datetime:dtime(minute),open:o,high:h,low:l,close:c,volume:v});
const bars=Array.from({length:40},(_,i)=>bar(570+i));
const nextBar=bar(610,{o:100.02,h:100.22,l:99.97,c:100.16});
const bench={regime:'TREND_UP_NORMAL_VOL_LIQUID',confidence:.95};
const f=m=>({day:D,barTime:dtime(m),minute:m,barCount:40,price:100,high:100.10,low:99.90,
  priorClose:99.5,priorLow:99.50,atr:.35,vwap:99.3,ema9:99.7,ema21:99.1,
  openingDollarVolume:1500000,volumeRatio:1.9,green:true,closePosition:.9,
  momentum3Pct:.45,momentum5Pct:.45});
const q=m=>({source:'Alpaca IEX latest quote',bid:100.15,ask:100.16,bidSize:90,askSize:90,timestamp:new Date(now(m).getTime()-1000).toISOString()});
let n=0;
const test=(name,fn)=>{try{fn();n++;console.log('PASS SCALP37 '+name);}catch(e){console.error('FAIL SCALP37 '+name);throw e;}};
const state=(minute=610,{prev=null,approved=['AAA'],quote=null,feature=f(minute-1),rows=bars,market=bench,enabled=true,extra={}}={})=>scalpCycle37({day:D,now:now(minute),minute,
  candidates:['AAA'],barMap:{AAA:rows},features:{AAA:feature},quotes:{AAA:quote},
  market,approved,enabled,previous:prev,...extra});
const pending=()=>state(610);
const opened=()=>state(611,{prev:pending().state,rows:[...bars,nextBar],feature:f(610),quote:q(611)});
const p=scalpPolicy37(bench);
const pos=()=>({id:'t1',day:D,symbol:'AAA',setupType:'MOMENTUM_SCALP',status:'OPEN',openedBarTime:dtime(610),
  lastEvaluatedBarTime:dtime(610),entry:100,initialStop:99.7,initialRisk:.3,stop:99.7,target:100.9,
  qty:8,remainingQty:8,realizedGrossUsd:0,partialTaken:false,feesUsd:2,holdBars:0});

test('fail-closed opt-in OFF; no entries',()=>{const x=state(610,{enabled:false});assert.equal(x.state.status,'DISABLED_BY_DEFAULT');assert.equal(x.state.tradeCount,0);});
test('only completed bars produce a signal and pending entry',()=>{const x=pending();assert.equal(x.state.records.AAA.status,'PENDING');assert.equal(x.state.records.AAA.pending.type,'MOMENTUM_SCALP');});
test('L1 validation requires genuine nonfuture positive-size narrow quotes',()=>{
 for(const sample of [null,{...q(611),source:'MANUAL'},{...q(611),bid:101,ask:100},
  {...q(611),askSize:0},{...q(611),timestamp:new Date(now(611).getTime()+5000).toISOString()},
  {...q(611),timestamp:new Date(now(611).getTime()-12000).toISOString()},
  {...q(611),ask:101}])assert.equal(scalpFreshQuote37(sample,now(611),p).passed,false);
 assert.equal(scalpFreshQuote37(q(611),now(611),p).passed,true);
});
test('valid later-minute trigger enters independent PAPER with positive net after fees',()=>{
 const x=opened(),s=x.state.records.AAA;assert.equal(s.status,'OPEN',JSON.stringify(s.entryChecks));
 assert(s.position.expectedNetUsdAtTarget>=.75);assert.equal(s.position.qty,9);
 assert.equal(s.position.strategyVariantId,'SCALP37_V1_PAPER');
 assert.equal(x.state.tradeCount,1);assert.equal(x.closedNew.length,0);
});
test('same-minute repeat is idempotently rejected',()=>{
 const a=pending(),b=state(610,{prev:a.state});assert.equal(b.state.status,'DUPLICATE_MINUTE_REJECTED');assert.equal(b.state.tradeCount,0);
});
test('no entry on signal minute even with attractive quote',()=>{
 const x=state(611,{prev:pending().state,rows:bars,feature:f(609),quote:q(611)});
 assert.notEqual(x.state.records.AAA.status,'OPEN');
});
test('unapproved symbol cannot signal or fill',()=>{
 const x=state(610,{approved:[]});assert.equal(x.state.records.AAA.reason,'SCALP_SHARIA_NOT_APPROVED');
 const y=state(611,{prev:pending().state,rows:[...bars,nextBar],feature:f(610),quote:q(611),approved:[]});
 assert.notEqual(y.state.records.AAA.status,'OPEN');
});
test('no entries if regime unknown, down or thin liquidity',()=>{
 for(const reg of ['UNKNOWN','TREND_DOWN_NORMAL_VOL_LIQUID','RANGE_NORMAL_VOL_THIN_LIQUIDITY']){
  const x=state(610,{market:{regime:reg,confidence:1}});
  assert.notEqual(x.state.records.AAA.status,'PENDING',reg);
 }
});
test('spread, stale quotes, missing liquidity fail closed without fill',()=>{
 const previous=pending().state;
 for(const quote of [null,{...q(611),bid:100,ask:100.2},{...q(611),timestamp:new Date(now(611).getTime()-8000).toISOString()}]){
  const x=state(611,{prev:previous,rows:[...bars,nextBar],feature:f(610),quote});
  assert.equal(x.state.tradeCount,0);
 }
});
test('daily hard limits prevent new entry and cap excessive churn',()=>{
 const previous=pending().state;
 for(const mutation of [s=>s.tradeCount=SCALP37_DEFAULTS.maxTradesDay,
  s=>s.closedOutcomes=[{id:'L',status:'CLOSED',netUsd:-26}],
  s=>{s.records.BBB={position:{status:'OPEN'}};s.records.CCC={position:{status:'OPEN'}};}]){
  const x=structuredClone(previous);mutation(x);
  const y=state(611,{prev:x,rows:[...bars,nextBar],feature:f(610),quote:q(611)});
  assert.equal(y.state.records.AAA.status,'PENDING');assert.equal(y.state.tradeCount,x.tradeCount||0);
 }
});
test('target closes only after entry bar net of modeled adverse exit slippage and flat fees',()=>{
 const x=settleScalpPosition37(pos(),[bar(610),bar(611,{o:100.01,h:100.96,l:99.99,c:100.8})],p);
 assert.equal(x.status,'CLOSED');assert.equal(x.outcome,'SCALP_TARGET');
 assert(x.netUsd<8*(100.9-100)-2);assert(x.netUsd>0);
});
test('stop beats target when both reached on same 1min candle',()=>{
 const x=settleScalpPosition37(pos(),[bar(611,{o:99.9,h:101.1,l:99.4,c:100.5})],p);
 assert.equal(x.status,'CLOSED');assert.equal(x.outcome,'SCALP_AMBIGUOUS_STOP_FIRST');assert(x.netUsd<0);assert.equal(x.ambiguousSameBar,true);
});
test('gap-through stop uses adverse bar open rather than impossible stop fill',()=>{
 const x=settleScalpPosition37(pos(),[bar(611,{o:99.1,h:99.4,l:99,c:99.2})],p);
 assert(x.exit<99.1);assert(x.netUsd<-8*.9-2);
});
test('partial profit books gross once, raises stop only after completed bar',()=>{
 const first=settleScalpPosition37(pos(),[bar(611,{o:100,h:100.4,l:99.95,c:100.34})],p);
 assert.equal(first.status,'OPEN');assert.equal(first.partialTaken,true);assert.equal(first.remainingQty,4);
 assert(first.realizedGrossUsd>0);assert(first.stop>100);
 const end=settleScalpPosition37(first,[bar(612,{o:100.1,h:100.2,l:99.9,c:99.99})],p);
 assert.equal(end.status,'CLOSED');assert.equal(end.outcome,'SCALP_STOP');
 assert(end.netUsd<first.realizedGrossUsd-2);
});
test('EOD closes at last completed available bar, never at a fabricated future price',()=>{
 const x=settleScalpPosition37(pos(),[bar(611,{o:100,h:100.2,l:99.9,c:100.1})],p,{forceClose:true});
 assert.equal(x.outcome,'SCALP_SESSION_EXIT');assert.equal(x.closedAt,dtime(611));
 const missing=settleScalpPosition37(pos(),[bar(610)],p,{forceClose:true});
 assert.equal(missing.status,'UNPRICED_AT_CLOSE');assert.equal(missing.netUsd,null);
});
test('time stop limits holding period; no indefinite scalp positions',()=>{
 const row=Array.from({length:11},(_,i)=>bar(611+i,{o:100.2,h:100.29,l:99.89,c:100.2}));
 const x=settleScalpPosition37(pos(),row,p);assert.equal(x.status,'CLOSED');assert.equal(x.outcome,'SCALP_TIME_EXIT');
 assert.equal(x.holdBars,p.maxHoldBars);
});
test('no same-day re-entry after a recorded close',()=>{
 const existing=opened().state;
 const existingPos=existing.records.AAA.position;
 existing.records.AAA.position={...existingPos,status:'CLOSED',netUsd:3,closedAt:dtime(612),outcome:'SCALP_TARGET'};
 existing.closedOutcomes=[{...existing.records.AAA.position}];
 const x=state(613,{prev:existing,rows:[...bars,nextBar,bar(612)],feature:f(612),quote:q(613)});
 assert.equal(x.state.tradeCount,1);assert.equal(x.state.records.AAA.status,'CLOSED');
});
test('same trade recorded once even if stored in closedOutcomes twice',()=>{
 const p1={...pos(),status:'CLOSED',netUsd:3};
 const x=scalpSummary37({records:{AAA:{position:p1}},closedOutcomes:[p1,p1],tradeCount:1});
 assert.equal(x.closed,1);assert.equal(x.netPaperUsd,3);
});
test('runner integration is isolated and disabled by default',()=>{
 const initial=process.env.DT37_AI_SCALP_PAPER_ENABLED;delete process.env.DT37_AI_SCALP_PAPER_ENABLED;
 try{
  const x=independentCycle({dateKey:D,now:now(610),minute:610,universe:['AAA'],batch:['AAA'],
   barMap:{AAA:bars,SPY:bars},quotes:{AAA:q(610)},approved:['AAA']});
  assert.equal(x.audit.scalp37.summary.entered,0);assert.equal(x.state.scalp37.status,'DISABLED_BY_DEFAULT');
  assert.equal(x.state.records.AAA.position??null,null);
 }finally{if(initial===undefined)delete process.env.DT37_AI_SCALP_PAPER_ENABLED;else process.env.DT37_AI_SCALP_PAPER_ENABLED=initial;}
});
test('runner with paper enabled uses existing bars without sending orders',()=>{
 const initial=process.env.DT37_AI_SCALP_PAPER_ENABLED;process.env.DT37_AI_SCALP_PAPER_ENABLED='true';
 try{
  const x=independentCycle({dateKey:D,now:now(610),minute:610,universe:['AAA','BBB','CCC'],batch:['AAA','BBB','CCC'],
   barMap:{AAA:bars,BBB:bars,CCC:bars,SPY:bars},quotes:{AAA:q(610)},approved:['AAA','BBB','CCC']});
  assert.equal(x.state.scalp37.status,'ACTIVE_INDEPENDENT_PAPER');assert.equal(x.audit.scalp37.events.length,3);
  assert.equal(x.audit.scalp37.summary.noOrders,true);
 }finally{if(initial===undefined)delete process.env.DT37_AI_SCALP_PAPER_ENABLED;else process.env.DT37_AI_SCALP_PAPER_ENABLED=initial;}
});
console.log('DT37_SCALP_PAPER_PASS',n+'/'+n);
