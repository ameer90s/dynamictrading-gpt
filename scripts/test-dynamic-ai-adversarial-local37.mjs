// Independent supplemental adversarial QA for the LOCAL prototype; no network or side effects.
import assert from 'node:assert/strict';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
import {updateAiPaperOutcome} from '../netlify/functions/lib/ai-parallel36.mjs';
const D='2026-10-30',iso=m=>`${D} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const now=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60+1,3));
const bar=(m,p,v=4500)=>({datetime:iso(m),open:+(p-.08).toFixed(4),high:+(p+.06).toFixed(4),low:+(p-.20).toFixed(4),close:+p.toFixed(4),volume:v});
const prices=[];for(let m=570;m<=700;m++){let p=100;if(m>=585&&m<690)p=100.06+(m-585)*.005;if(m>=690)p=100.58+(m-690)*.105;prices.push(bar(m,p,m>=695?18000:4500));}
const slice=m=>prices.filter(x=>+x.datetime.slice(11,13)*60+ +x.datetime.slice(14,16)<=m),spy=m=>Array.from({length:m-569},(_,i)=>bar(570+i,100,10000));
const cycle=(m,existing={})=>independentCycle({dateKey:D,now:now(m),minute:m,universe:['AI1'],batch:['AI1'],barMap:{AI1:slice(m),SPY:spy(m)},approved:['AI1'],existing});
let cases=0;function check(n,fn){fn();cases++;console.log('PASS INDEPENDENT '+n);}
const first=cycle(695);const firstSignal=first.state.records.AI1.pending;
check('created pending setup has durable identifiable signal timestamp',()=>{assert(firstSignal&&firstSignal.signalMinute===695);assert(first.audit.lifecycleEvents.some(e=>e.kind==='SETUP_PENDING_CREATED'));});
const old={...first.state,records:{AI1:{...first.state.records.AI1,pending:{...firstSignal,validUntil:695}}}};
const replaced=cycle(696,old);
check('expired and same-minute replaced pending emits BOTH lifecycle events',()=>{
 assert.equal(replaced.state.records.AI1.pending.signalMinute,696);
 const types=replaced.audit.lifecycleEvents.map(e=>e.kind);
 assert(types.includes('PENDING_EXPIRED_OR_CANCELLED'),JSON.stringify(types));
 assert(types.includes('SETUP_PENDING_CREATED'),JSON.stringify(types));
});
check('same-minute replacement identifies two distinct signal minutes',()=>{
 const exp=replaced.audit.lifecycleEvents.find(e=>e.kind==='PENDING_EXPIRED_OR_CANCELLED');
 const created=replaced.audit.lifecycleEvents.find(e=>e.kind==='SETUP_PENDING_CREATED');
 assert.equal(exp.signal.signalMinute,695);assert.equal(created.signal.signalMinute,696);
});
const position={id:`${D}:AI1:695:BREAKOUT_CONTINUATION`,status:'OPEN',entry:101,stop:95,target:115,qty:1,feesUsd:2,openedBarTime:iso(695),lastEvaluatedBarTime:iso(695),shadowHits:{},timeline:[],mfePct:0,maePct:0};
check('stale market price at forced session close NEVER creates paper PnL',()=>{
 const r=updateAiPaperOutcome({position},[bar(896,101)],now(959),{forceClose:true});
 assert.equal(r.position.status,'CLOSED');assert.equal(r.position.outcome,'UNPRICED_AT_CLOSE');
 assert.equal(r.position.netUsd,null);assert.equal(r.position.exit,null);assert.equal(r.position.exitEvidence.noBrokerFill,true);
});
check('timely completed market price at forced session close records explicit paper price',()=>{
 const r=updateAiPaperOutcome({position},[bar(957,101)],now(959),{forceClose:true});
 assert.equal(r.position.outcome,'EXPIRED');assert.equal(r.position.netUsd,-2);
 assert.equal(r.position.closedAt,iso(957));assert.equal(r.position.exitEvidence.pricingMode,'CLOSE_OF_LAST_COMPLETED_BAR');
});
check('same-minute stop+target crossover is ambiguous and never made profitable',()=>{
 const r=updateAiPaperOutcome({position},[{...bar(696,101),low:94,high:116}],now(698));
 assert.equal(r.position.outcome,'AMBIGUOUS_SAME_BAR');assert.equal(r.position.netUsd,null);
 assert.equal(r.position.exitEvidence.ambiguity,true);
});
check('subsequent repeat bars never double-book exit evidence',()=>{
 const barHit={...bar(696,101),low:94,high:116};
 const r=updateAiPaperOutcome({position},[barHit],now(698));
 const again=updateAiPaperOutcome(r,[barHit],now(699));
 assert.equal(again.position.timeline.length,1);
 assert.equal(again.position.netUsd,null);
});
console.log(`DT37_INDEPENDENT_ADVERSARIAL_LOCAL_PASS ${cases}/${cases}`);
