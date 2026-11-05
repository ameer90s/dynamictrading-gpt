import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateReplayProposal37,replayThreeScanners37} from '../netlify/functions/lib/research-historical-replay37.mjs';
import {deriveFrozenResearchSpecs37,runResearchReplayBatch37,runThreeEngineWalkForward37} from '../netlify/functions/lib/research-experiment-batch37.mjs';
import {attachExperimentEvidence37} from '../netlify/functions/lib/research-experiment-engine37.mjs';
import {RESEARCH36_POLICY} from '../netlify/functions/lib/research36.mjs';
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const sharia=readFileSync(new URL('../data/sharia-master-us-stocks.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(r=>r.split(',')[0]);
const family='DT37_FAMILY_aaaaaaaaaaaaaaaaaaaaaaaa';
const proposal={proposalId:'LOCAL_FROZEN_EXAMPLE',family,engine:'SCANNER',parameter:'minClosePosition',direction:'INCREASE',delta:.1,lockedAt:'2026-09-01'};
const spec={fixture,proposal,trainingEnd:'2026-09-30',holdoutStart:'2026-10-01',holdoutEnd:'2026-10-03',approvedSymbols:sharia,everyMinutes:10};
let n=0;function test(title,fn){fn();n++;console.log(`PASS ${title}`)}
test('registered proposal admitted only when locked before holdout',()=>assert.equal(validateReplayProposal37(proposal,'2026-09-30','2026-10-01').direction,'INCREASE'));
test('no future-locked parameter trial',()=>assert.throws(()=>validateReplayProposal37({...proposal,lockedAt:'2026-10-02'},'2026-09-30','2026-10-01')));
test('no arbitrary executable parameter or code',()=>assert.throws(()=>validateReplayProposal37({...proposal,parameter:'eval'},'2026-09-30','2026-10-01')));
test('no risk loosening',()=>assert.throws(()=>validateReplayProposal37({...proposal,direction:'DECREASE'},'2026-09-30','2026-10-01')));
test('large parameter jump refused',()=>assert.throws(()=>validateReplayProposal37({...proposal,delta:.75},'2026-09-30','2026-10-01')));
const r=replayThreeScanners37(spec);
test('reads real stored selected-symbol archive without pretending universe coverage',()=>{
 assert.equal(r.coverage.archiveKind,'SELECTED_SYMBOL_DAYS_NOT_FULL_UNIVERSE');
 assert.equal(r.coverage.holdoutSessions,2);assert.ok(r.coverage.sourceBarSeries>40);
});
test('all three actual detectors evaluated with independent state',()=>{
 assert.deepEqual(Object.keys(r.comparisons),['SCANNER','AI','SCALP']);
 for(const c of Object.values(r.comparisons))assert.ok(c.baseline.minutesEvaluated>0);
});
test('never manufacture quotes fills profits or validation',()=>{
 assert.equal(r.coverage.actualHistoricalL1Quotes,0);assert.equal(r.coverage.actualBrokerFills,0);
 assert.equal(r.executionProfitabilityVerified,false);assert.equal(r.eligibleForProductionApproval,false);
 for(const c of Object.values(r.comparisons))assert.equal(c.verifiedNetUsd,null);
});
test('replay is deterministic including cryptographic source digest',()=>{
 const other=replayThreeScanners37(spec);
 assert.equal(other.runId,r.runId);assert.equal(other.coverage.sourceBarDigest,r.coverage.sourceBarDigest);
});
test('candidate cannot modify source production scanner policy',()=>{
 assert.equal(RESEARCH36_POLICY.minClosePosition,.65);
 assert.deepEqual(r.comparisons.AI.baseline.signals,r.comparisons.AI.candidate.signals);
});
test('no historical point-in-time Sharia approval is assumed',()=>{
 const missing=replayThreeScanners37({...spec,approvedSymbols:[]});
 for(const c of Object.values(missing.comparisons))assert.equal(c.baseline.signals,0);
});
test('fails closed on duplicate candles',()=>{
 const b=fixture.bars['2026-10-01|OXY'];
 const bad={bars:{'2026-10-01|SPY':fixture.bars['2026-10-01|SPY'],'2026-10-01|OXY':[...b,b[0]]}};
 assert.throws(()=>replayThreeScanners37({...spec,fixture:bad}));
});
test('fails closed on forged OHLCV low or negative volume',()=>{
 const b=fixture.bars['2026-10-01|OXY'].map(x=>[...x]);b[0][5]=-2;
 assert.throws(()=>replayThreeScanners37({...spec,fixture:{bars:{'2026-10-01|SPY':fixture.bars['2026-10-01|SPY'],'2026-10-01|OXY':b}}}));
});
test('no audit of an empty holdout can become a winner',()=>{
 const x=replayThreeScanners37({...spec,holdoutStart:'2026-11-05',holdoutEnd:'2026-11-07'});
 assert.equal(x.status,'NO_HISTORICAL_HOLDOUT_DATA');assert.equal(x.eligibleForProductionApproval,false);
});
test('sampling cadence cannot masquerade as full-minute replay',()=>{
 assert.equal(r.coverage.replayStrideMinutes,10);assert.equal(r.coverage.fullMinuteReplay,false);
});
test('weekly candidates not ready and harmful variants are not re-tested',()=>{
 const period={kind:'WEEKLY',end:'2026-09-25',candidates:[
  {family,engines:['SCANNER'],status:'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL',variant:{kind:'TIGHTER_EXECUTION_GATES',scanner:{maxSpreadBps:{from:12,to:10.8}}}},
  {family:'DT37_FAMILY_bbbbbbbbbbbbbbbbbbbbbbbb',engines:['AI'],status:'SUPPRESSED_HISTORICAL_NEGATIVE',suppressed:true,variant:{kind:'TIGHTER_EXECUTION_GATES'}}]};
 const x=deriveFrozenResearchSpecs37(period,'2026-10-01');assert.equal(x.queued.length,1);assert.equal(x.skipped[0].reason,'PREVIOUSLY_REJECTED_OR_HARMFUL');
});
test('cannot test researcher proposal on pre-report history',()=>{
 const period={kind:'MONTHLY',end:'2026-10-31',candidates:[{family,engines:['SCANNER'],status:'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL',variant:{kind:'TIGHTER_EXECUTION_GATES',scanner:{maxSpreadBps:{from:12,to:10.8}}}}]};
 assert.equal(deriveFrozenResearchSpecs37(period,'2026-10-01').queued.length,0);
});
test('automated batch stays offline and produces no approval',()=>{
 const p={kind:'WEEKLY',end:'2026-09-25',candidates:[{family,engines:['SCANNER'],status:'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL',variant:{kind:'TIGHTER_EXECUTION_GATES',scanner:{maxSpreadBps:{from:12,to:10.8}}}}]};
 const x=runResearchReplayBatch37({period:p,fixture,holdoutStart:'2026-10-01',holdoutEnd:'2026-10-03',approvedSymbols:sharia,everyMinutes:10});
 assert.equal(x.queued,1);assert.equal(x.costControl.remoteCalls,0);assert.equal(x.reports[0].eligibleForProductionApproval,false);
});
test('walk forward rejects overlapping test folds',()=>assert.throws(()=>runThreeEngineWalkForward37({fixture,proposal,approvedSymbols:sharia,folds:[
 {trainingEnd:'2026-09-16',holdoutStart:'2026-09-17',holdoutEnd:'2026-09-30'},
 {trainingEnd:'2026-09-30',holdoutStart:'2026-09-30',holdoutEnd:'2026-10-03'}],everyMinutes:10})));
test('two disjoint walk-forward folds do not retune or authorize trading',()=>{
 const x=runThreeEngineWalkForward37({fixture,proposal,approvedSymbols:sharia,folds:[
  {trainingEnd:'2026-09-16',holdoutStart:'2026-09-17',holdoutEnd:'2026-09-19'},
  {trainingEnd:'2026-09-30',holdoutStart:'2026-10-01',holdoutEnd:'2026-10-03'}],everyMinutes:10});
 assert.equal(x.folds.length,2);assert.equal(x.retuneBetweenFolds,false);assert.equal(x.verifiedBrokerPnL,false);
});
test('periodic report attaches historical evidence without fake PNL or manual approval',()=>{
 const x=attachExperimentEvidence37({kind:'MONTHLY',candidates:[{family,engines:['SCANNER']}]},[r]);
 assert.equal(x.candidates[0].experimentEvidence.length,1);
 assert.equal(x.candidates[0].experimentEvidence[0].verifiedMarketPnl,false);
 assert.equal(x.candidates[0].eligibleForProductionApproval,false);
});
console.log(`DT37_HISTORICAL_SIGNAL_REPLAY_PASS ${n}/${n}`);
