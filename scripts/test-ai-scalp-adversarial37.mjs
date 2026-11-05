import assert from 'node:assert/strict';
import {scalpCycle37,settleScalpPosition37,scalpPolicy37} from '../netlify/functions/lib/ai-scalp-paper37.mjs';
const d='2026-10-30';
const ny=m=>`${d} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const b=(m,o,h,l,c)=>({datetime:ny(m),open:o,high:h,low:l,close:c,volume:20000});
const now=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60,3));
const makePos=()=>({id:'x',status:'OPEN',symbol:'ABC',day:d,openedAt:now(610).toISOString(),openedBarTime:ny(610),lastEvaluatedBarTime:ny(610),
 entry:100,stop:99.75,initialStop:99.75,initialRisk:.25,target:100.9,qty:8,remainingQty:8,feesUsd:2,realizedGrossUsd:0,partialTaken:false});
const market={regime:'TREND_UP_NORMAL_VOL_LIQUID',confidence:1};const policy=scalpPolicy37(market);
let n=0;const test=(name,fn)=>{fn();n++;console.log('PASS ADV_SCALP37',name)};
test('a stop always wins if both levels cross in the same candle across hundreds of deterministic cases',()=>{
 for(let i=0;i<350;i++){
  const low=99.1+(i%6)*.1,high=101+(i%4)*.05;
  const r=settleScalpPosition37(makePos(),[b(611,99.75,high,low,100.15)],policy);
  assert.equal(r.outcome,'SCALP_AMBIGUOUS_STOP_FIRST');assert(r.netUsd<0);
 }
});
test('missing timely end-of-day price cannot manufacture a close or P&L',()=>{
 const x=settleScalpPosition37(makePos(),[b(611,100,100.1,99.9,100)],policy,{forceClose:true,asOfMinute:959});
 assert.equal(x.status,'UNPRICED_AT_CLOSE');assert.equal(x.netUsd,null);
});
test('disabled mid-session drains existing positions and blocks all new entry',()=>{
 const previous={schemaVersion:'3.7-SCALP-PAPER-1',day:d,records:{ABC:{symbol:'ABC',day:d,status:'OPEN',position:makePos()},
   NEW:{symbol:'NEW',day:d,status:'OBSERVING',pending:null,position:null}},closedOutcomes:[],tradeCount:1,entryRejections:{},cycleCount:1,lastMinute:610};
 const x=scalpCycle37({day:d,now:now(612),minute:612,previous,enabled:false,candidates:['NEW'],approved:['NEW','ABC'],
  market,barMap:{ABC:[b(611,100,101,99.7,100.5)],NEW:[b(611,100,100.2,99.8,100)]}});
 assert.equal(x.state.status,'DRAINING_DISABLED_POSITIONS_NO_NEW_ENTRY');
 assert.equal(x.state.tradeCount,1);assert.equal(x.state.records.NEW.status,'DISABLED_NO_NEW_ENTRIES');
 assert.equal(x.state.records.ABC.status,'CLOSED');assert.equal(x.closedNew.length,1);
});
test('bad same-day persisted state fails closed rather than silently resetting trading history',()=>{
 const x=scalpCycle37({day:d,now:now(612),minute:612,previous:{day:d,schemaVersion:'CORRUPT'},enabled:true,market});
 assert.equal(x.state.status,'INVALID_PREVIOUS_STATE_FAIL_CLOSED');assert.equal(x.state.tradeCount,0);
});
test('end-of-day quote-less close with zero complete post-entry bars remains unknown',()=>{
 const state={schemaVersion:'3.7-SCALP-PAPER-1',day:d,records:{ABC:{symbol:'ABC',day:d,position:makePos(),status:'OPEN'}},closedOutcomes:[],tradeCount:1,entryRejections:{},cycleCount:1,lastMinute:611};
 const x=scalpCycle37({day:d,now:now(959),minute:959,previous:state,enabled:true,candidates:['ABC'],market,
  approved:['ABC'],barMap:{ABC:[]},sessionEndMinute:959});
 assert.equal(x.state.records.ABC.position.status,'UNPRICED_AT_CLOSE');
 assert.equal(x.state.closedOutcomes[0].netUsd,null);
});
test('no new trading when current New York calendar day disagrees with persisted day',()=>{
 const x=scalpCycle37({day:'2026-11-01',now:now(611),minute:611,enabled:true,market});
 assert.equal(x.state.status,'DATE_MISMATCH_FAIL_CLOSED');
});
console.log('DT37_SCALP_ADVERSARIAL_PASS',n+'/'+n);
