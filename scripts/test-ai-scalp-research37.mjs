import assert from 'node:assert/strict';
import {scalpResearchHistory37,generateStrategyLearningCycle37} from '../netlify/functions/lib/research-strategy-cycle37.mjs';
import {summarizePeriodScalp37,consolidateResearchPeriod37,proposalFamily37,memoryFromFeedback37,
 annotateDailyProposals37} from '../netlify/functions/lib/research-memory-cadence37.mjs';
const day='2026-10-30',after='2026-10-30T21:30:00Z',period={kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'};
const trade=(id,net=-3,setup='MOMENTUM_SCALP',closedAt='2026-10-30T19:00:00Z')=>({id,status:'CLOSED',day,openedAt:'2026-10-30T14:00:00Z',
  closedAt,setupType:setup,netUsd:net,strategyVariantId:'SCALP37_V1_PAPER'});
const book=(closedOutcomes=[],entryRejections={})=>({schemaVersion:'3.7-SCALP-PAPER-1',day,closedOutcomes,entryRejections});
const state=(closedOutcomes=[],entryRejections={})=>({scalp37:book(closedOutcomes,entryRejections),records:{},closedOutcomes:[]});
let tests=0;const test=(name,fn)=>{fn();tests++;console.log('PASS SCALP_RESEARCH37 '+name)};
test('scalp paper trade is not silently counted as base AI trade',()=>{
 const audit={dateKey:day,sourceDigest:'abc',comparison:{},streams:{scanner:{},ai:{}}};
 const x=generateStrategyLearningCycle37({day,audit,aiState:state([trade('1',-3)]),now:after});
 assert.equal(x.historical.ai.closedUnique,0);
 assert.equal(x.historical.scalp.uniqueClosed,1);
 assert.equal(x.historical.scalp.netModeledUsd,-3);
 assert.equal(x.historical.scalp.actualBrokerFillsVerified,false);
 assert.equal(x.canAutoApply,false);
});
test('closed scalp loss triggers only daily research suggestion, never direct strategy change',()=>{
 const audit={dateKey:day,sourceDigest:'abc',comparison:{},streams:{scanner:{},ai:{}}};
 const x=generateStrategyLearningCycle37({day,audit,aiState:state([trade('1',-3)],{'SCALP_SPREAD_LIMIT':4}),now:after});
 assert(x.proposals.some(p=>p.source==='SCALP_PAPER_RECORDS'&&p.area==='RISK_GATES'));
 assert(x.proposals.some(p=>p.source==='SCALP_PAPER_RECORDS'&&p.area==='COSTS_SPREAD'));
 assert(x.proposals.filter(p=>p.source==='SCALP_PAPER_RECORDS').every(p=>p.applied===false&&p.canTrade===false));
});
test('same paper position across historical snapshots is counted once',()=>{
 const x=scalpResearchHistory37([state([trade('1',-3)]),state([trade('1',-3),trade('2',2)])],day,after);
 assert.equal(x.uniqueClosed,2);assert.equal(x.netModeledUsd,-1);
});
test('future and unknown outcomes never inflate learner',()=>{
 const rows=[trade('f',9999,'MOMENTUM_SCALP','2026-11-03T20:00:00Z'),
   {...trade('m',1000),status:'UNPRICED_AT_CLOSE',netUsd:null},trade('ok',-2)];
 const x=scalpResearchHistory37([state(rows)],day,after);
 assert.equal(x.uniqueClosed,1);assert.equal(x.netModeledUsd,-2);
});
test('monthly scalp outcomes separately counted and unique',()=>{
 const s=state([trade('A',-2),trade('A',-2),trade('B',3,'VWAP_RECLAIM_SCALP')]);
 const x=summarizePeriodScalp37({period,states:[s,s]});
 assert.equal(x.uniqueClosed,2);assert.equal(x.bySetup.MOMENTUM_SCALP.closed,1);
 assert.equal(x.bySetup.VWAP_RECLAIM_SCALP.paperNetUsd,3);
 assert.equal(x.readyForDescriptiveLearning,false);
});
test('60 unique scalp outcomes permit descriptive sample, not production activation',()=>{
 const s=state(Array.from({length:60},(_,i)=>trade('S'+i,i%2?2:-3)));
 const x=summarizePeriodScalp37({period,states:[s,s]});
 assert.equal(x.uniqueClosed,60);assert.equal(x.readyForDescriptiveLearning,true);
 assert.equal(x.causalVariantComparisonVerified,false);
 const days=Array.from({length:20},(_,i)=>new Date(Date.UTC(2026,9,1+i,12)).toISOString().slice(0,10));
 const cycles=days.map(d=>({day:d,recordedEvidenceComplete:true,historyReadIssues:[],proposals:[]}));
 const y=consolidateResearchPeriod37({period,cycles,scalpOutcomes:x,now:after,
  outcomes:{uniqueClosed:0,readyForDescriptiveLearning:false}});
 assert.equal(y.scalpPaperOutcomes.uniqueClosed,60);
 assert.equal(y.scalpMonthlyDescriptiveStudyReady,true);
 assert.equal(y.statisticsReadyForMonthlyLearning,false);
 assert.equal(y.canAutoApply,false);assert.equal(y.applied,false);
});
test('rejected/negative historical candidate remains suppressed independently of scalp outcomes',()=>{
 const variant={area:'RISK_GATES',engines:['AI'],candidateStrategy:{kind:'PAPER_RISK_COMPARISON',target:'AI',rules:['BASELINE_SHADOW_VS_CONSERVATIVE_TRAILING_EXIT','NO_HIGHER_CASH_RISK']}};
 const family=proposalFamily37(variant);
 const memory={entries:{[family]:{blocked:true,lastVerdict:'HARMFUL_OBSERVED',blockingVerdict:'HARMFUL_OBSERVED'}}};
 const x=annotateDailyProposals37({proposals:[{id:'t',...variant}]},memory);
 assert.equal(x.proposals[0].suppressedFromRecommendations,true);
});
console.log('DT37_SCALP_RESEARCH_PASS',tests+'/'+tests);
