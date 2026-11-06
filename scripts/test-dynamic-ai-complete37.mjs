import assert from 'node:assert/strict';
import {evaluateIndependentAi,featureSet,adaptiveAiPolicy,updateAiPaperOutcome} from '../netlify/functions/lib/ai-parallel36.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
import {planAiAdaptiveBatch37} from '../netlify/functions/lib/ai-adaptive-scheduler37.mjs';
const D='2026-10-30';let count=0;
const check=(name,fn)=>{try{fn();count++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}};
const iso=m=>`${D} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const now=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60+1,3));
const make=(m,base,vol=4500)=>({datetime:iso(m),open:+(base-.08).toFixed(4),high:+(base+.06).toFixed(4),low:+(base-.20).toFixed(4),close:+base.toFixed(4),volume:vol});
const spy=Array.from({length:331},(_,i)=>make(i+570,100,10000));
const openingWeak=[];
for(let m=570;m<=700;m++){
 let price=100;
 if(m>=585&&m<690)price=100.06+(m-585)*.005;
 if(m>=690)price=100.58+(m-690)*.105;
 openingWeak.push(make(m,price,m===695?18000:4500));
}
const barsAt=(m)=>openingWeak.filter(b=>Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))<=m);
const spyAt=(m)=>spy.filter(b=>Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))<=m);
const run=(m,prior=null,quote=null,extra={})=>evaluateIndependentAi('AI1',barsAt(m),spyAt(m),quote,{now:now(m),prior,approved:true,...extra});
const audit=run(695);
check('matched-window opening relative strength does not change from late SPY movement',()=>{
 const s1=spyAt(590),s2=spyAt(700).map((x,i)=>i<20?x:{...x,close:105,open:105,high:105.1,low:104.9});
 const raw=openingWeak.slice(0,21).map(b=>({...b,_time:{min:Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))}}));
 const a=featureSet(raw,s1.map(b=>({...b,_time:{min:Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))}})));
 const b=featureSet(raw,s2.map(q=>({...q,_time:{min:Number(q.datetime.slice(11,13))*60+Number(q.datetime.slice(14,16))}})));
 assert.equal(a.relativeStrengthPct,b.relativeStrengthPct);
});
check('late recovery can pass session gates despite weak opening',()=>{
 assert(audit.checks.opening.some(x=>!x.passed&&x.reason==='OPEN_RETURN_LOW'));
 assert.equal(audit.checks.session.every(x=>x.passed),true);
 assert(audit.setupDiscovery.some(x=>x.eligible));
});
check('late-entry dynamic policy extends to 15 ET with conservative quote guard',()=>{
 const p=adaptiveAiPolicy([audit.features],[],890);
 assert.equal(p.params.normalMaxMinute,900);
 assert(p.params.quoteAgeSec<=9);
});
check('all relevant audits preserve each failed gate instead of just the first',()=>{
 const bad=run(695,null,null,{approved:false});assert(bad.decisionTrace.allFailedChecks.length>=2);
});
check('bad or stale quotes can never open paper position',()=>{
 const p=audit.pending;assert(p,'expected pending');
 const late=run(696,{pending:p},{source:'Alpaca IEX',bid:100.9,ask:101,bidSize:5,askSize:5,timestamp:'2026-10-30T10:00:00Z'});
 assert.notEqual(late.state,'AI_PAPER_CONFIRMED');
});
check('scanner respects Sharia approvals even with high momentum',()=>{
 const d=run(695,null,null,{approved:false});assert.equal(d.state,'REGULAR');
});
check('adaptive batch holds strict capacity and records its rationale',()=>{
 const all=Array.from({length:96},(_,i)=>'S'+i);
 const p=planAiAdaptiveBatch37({eligible:all,capacity:12,now:now(697)});
 assert.equal(p.batch.length,12);assert.equal(new Set(p.batch).size,12);assert(p.ranking.every(x=>x.priority>=0));
});
check('pending events are included in immutable per-minute audit',()=>{
 const o=independentCycle({dateKey:D,now:now(695),minute:695,universe:['AI1'],batch:['AI1'],barMap:{AI1:barsAt(695),SPY:spyAt(695)},approved:['AI1']});
 assert(o.audit.snapshots.length===1);assert(o.audit.lifecycleEvents.some(x=>x.kind==='SETUP_PENDING_CREATED'));
 assert(o.state.lifecycleEventCount>=1);assert(o.audit.snapshots[0].decisionTrace?.allFailedChecks);
});

check('full late breakout signal -> fresh quote -> paper fill -> target close -> archived lifecycle',()=>{
 const pendingCycle=independentCycle({dateKey:D,now:now(695),minute:695,universe:['AI1'],batch:['AI1'],
   barMap:{AI1:barsAt(695),SPY:spyAt(695)},approved:['AI1']});
 const signal=pendingCycle.state.records.AI1.pending;
 assert.equal(signal.type,'BREAKOUT_CONTINUATION');
 const quote={source:'Alpaca IEX latest quote',bid:101.185,ask:101.19,bidSize:100,askSize:110,
   timestamp:new Date(now(696).getTime()-1000).toISOString()};
 const entryCycle=independentCycle({dateKey:D,now:now(696),minute:696,universe:['AI1'],batch:['AI1'],
   barMap:{AI1:barsAt(696),SPY:spyAt(696)},quotes:{AI1:quote},approved:['AI1'],existing:pendingCycle.state});
 const pos=entryCycle.state.records.AI1.position;
 assert.equal(pos?.status,'OPEN',JSON.stringify(entryCycle.state.records.AI1.latestChecks?.execution?.filter(x=>!x.passed)));
 assert.equal(pos.setupType,'BREAKOUT_CONTINUATION');
 assert(pos.entryEvidence.checks.every(x=>x.passed));
 assert(pos.timeline.some(x=>x.type==='PAPER_ENTRY_CONFIRMED'));
 assert(entryCycle.audit.lifecycleEvents.some(x=>x.kind==='PAPER_ENTRY_CONFIRMED'));
 assert(pos.target>pos.entry&&pos.stop<pos.entry);
 const completed={datetime:iso(697),open:pos.entry+.04,high:pos.target+.1,
   low:pos.entry-.06,close:pos.target-.02,volume:15000};
 const exitCycle=independentCycle({dateKey:D,now:now(698),minute:698,universe:['AI1'],batch:['AI1'],
   barMap:{AI1:[...barsAt(696),completed],SPY:spyAt(698)},approved:['AI1'],existing:entryCycle.state});
 const finished=exitCycle.state.records.AI1.position;
 assert.equal(finished.status,'CLOSED');assert.equal(finished.outcome,'TARGET');
 assert(finished.netUsd>0);assert.equal(finished.exitEvidence.bar.datetime,iso(697));
 assert.equal(finished.entryEvidence.costModel,'MODELED_PAPER_NO_BROKER_FILL');
 assert(finished.exitEvidence.evidenceOnly&&finished.exitEvidence.noBrokerFill);
 assert(finished.timeline.some(x=>x.type==='PAPER_EXIT_RECORDED'));
 assert(exitCycle.audit.lifecycleEvents.some(x=>x.kind==='PAPER_EXIT_RECORDED'));
 assert.equal(exitCycle.audit.closedNew.length,1);
 const again=independentCycle({dateKey:D,now:now(699),minute:699,universe:['AI1'],batch:['AI1'],
   barMap:{AI1:[...barsAt(696),completed],SPY:spyAt(699)},approved:['AI1'],existing:exitCycle.state});
 assert.equal(again.state.records.AI1.state,'RESULT_RECORDED');
 assert(!again.audit.lifecycleEvents.some(x=>x.kind==='PAPER_EXIT_RECORDED'));
});
check('missing or stale market candles reject any new paper entry',()=>{
 const fresh=run(695);const q={source:'Alpaca IEX latest quote',bid:101.185,ask:101.19,bidSize:100,askSize:100,
   timestamp:new Date(now(700).getTime()-1000).toISOString()};
 const old=evaluateIndependentAi('AI1',barsAt(695),spyAt(695),q,{now:now(700),prior:{pending:fresh.pending},approved:true});
 assert(old.decisionTrace.allFailedChecks.some(x=>x.reason==='STALE_CANDLE'));
 assert.notEqual(old.state,'AI_PAPER_CONFIRMED');
});
check('stale SPY benchmark makes late setup ineligible',()=>{
 const x=evaluateIndependentAi('AI1',barsAt(695),spyAt(690),null,{now:now(695),approved:true});
 assert(x.decisionTrace.allFailedChecks.some(g=>g.reason==='STALE_BENCHMARK'));
 assert.equal(x.pending,null);assert.notEqual(x.state,'AI_PAPER_CONFIRMED');
});
check('missing SPY benchmark cannot produce a late paper trade',()=>{
 const x=evaluateIndependentAi('AI1',barsAt(695),[],null,{now:now(695),approved:true});
 assert(x.decisionTrace.allFailedChecks.some(g=>g.reason==='STALE_BENCHMARK'));
 assert.equal(x.pending,null);
});
check('bounded adaptive scheduler visits all eligible symbols without a hot-priority starvation',()=>{
 const all=Array.from({length:96},(_,i)=>'S'+i),records={},base=now(700).getTime();
 for(let minute=0;minute<12;minute++){
  const at=new Date(base+minute*60000),p=planAiAdaptiveBatch37({eligible:all,records,capacity:12,now:at});
  for(const symbol of p.batch)records[symbol]={lastSeenAt:at.toISOString(),latestFeatures:{}};
 }
 assert.equal(Object.keys(records).length,96);
});

console.log('DT37_DYNAMIC_AI_COMPLETE_LOCAL_PASS',count);
