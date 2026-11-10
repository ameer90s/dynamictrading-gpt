/** Offline-only binding between weekly/monthly research proposals and replay.
 * This never loads secrets, writes production storage, sends orders or approves changes.
 */
import {replayThreeScanners37} from './research-historical-replay37.mjs';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validDay=x=>/^20\d{2}-\d\d-\d\d$/.test(x||'');
/** Only explicitly representable, bounded policy changes may enter experiments. */
export function deriveFrozenResearchSpecs37(period,holdoutStart){
 if(!['WEEKLY','MONTHLY'].includes(period?.kind)||!validDay(period?.end)||!validDay(holdoutStart))throw Error('PERIOD_OR_HOLDOUT_INVALID');
 const queued=[],skipped=[];
 for(const p of period.candidates||[]){
  const family=p.family;
  if(!/^DT37_FAMILY_[a-f0-9]{24}$/.test(family||'')){skipped.push({family:family||null,reason:'INVALID_FAMILY'});continue;}
  if(p.suppressed===true||p.status==='SUPPRESSED_HISTORICAL_NEGATIVE'){
   skipped.push({family,reason:'PREVIOUSLY_REJECTED_OR_HARMFUL'});continue;
  }
  if(period.end>=holdoutStart){skipped.push({family,reason:'NO_POST_RESEARCH_HOLDOUT'});continue;}
  if(p.status!=='READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL'){
   skipped.push({family,reason:'RESEARCH_SAMPLE_NOT_READY'});continue;
  }
  if(p.variant?.kind!=='TIGHTER_EXECUTION_GATES'){
   skipped.push({family,reason:'NO_SAFE_EXECUTABLE_POLICY_DELTA'});continue;
  }
  for(const engine of ['SCANNER','AI']){
   if(!p.engines?.includes(engine))continue;
   const delta=p.variant[engine.toLowerCase()]?.maxSpreadBps;
   // AI's baseline spread is dynamic: use an explicitly verified constant multiplier.
   const d=engine==='AI'&&delta?.rule==='MULTIPLY_BASELINE_BY_0.90' ? 0.1 :
    Number.isFinite(delta?.from)&&Number.isFinite(delta?.to)&&delta.from>delta.to&&delta.to>0?
     (delta.from-delta.to)/delta.from:null;
   if(!Number.isFinite(d)||d<=0||d>.5){skipped.push({family,engine,reason:'INVALID_SPREAD_DELTA'});continue;}
   queued.push({family,proposalId:(p.priorProposalIds||[])[0]||`DT37_PROP_${family.slice(-20)}`,
    engine,parameter:'maxSpreadBps',direction:'DECREASE',delta:Number(d.toFixed(6)),lockedAt:period.end});
  }
 }
 return {queued,skipped,requiresManualApproval:true};
}
export function runResearchReplayBatch37({period,fixture,holdoutStart,holdoutEnd,approvedSymbols=[],everyMinutes=5,maxExperiments=12}={}){
 const specs=deriveFrozenResearchSpecs37(period,holdoutStart);
 if(!validDay(holdoutEnd)||holdoutEnd<holdoutStart)throw Error('BATCH_HOLDOUT_INVALID');
 if(specs.queued.length>maxExperiments)throw Error('EXPERIMENT_BUDGET_EXCEEDED');
 const reports=[];
 for(const proposal of specs.queued){reports.push(replayThreeScanners37({fixture,proposal,trainingEnd:period.end,
  holdoutStart,holdoutEnd,approvedSymbols,everyMinutes}));}
 return {schemaVersion:'3.7-RESEARCH-REPLAY-BATCH-1',period:{kind:period.kind,end:period.end},
  holdoutStart,holdoutEnd,queued:specs.queued.length,skipped:specs.skipped,reports,
  costControl:{remoteCalls:0,brokerOrders:0,netlifyOperations:0,offlineOnly:true},
  decisions:'NO_AUTOMATIC_APPROVAL_OR_DEPLOY',researchMemoryModified:false,
  operationalStatus:'LOCAL_SIGNAL_REPLAY_ONLY',
  digest:hash([period.kind,period.end,holdoutStart,holdoutEnd,specs,reports.map(r=>r.runId)])};
}
/** Temporal folds are disjoint. Same frozen proposal; no retuning on a held-out fold. */
export function runThreeEngineWalkForward37({fixture,proposal,folds,approvedSymbols=[],everyMinutes=5}={}){
 if(!Array.isArray(folds)||folds.length<2||folds.length>12)throw Error('WALK_FORWARD_FOLDS_REQUIRED');
 const sorted=[...folds].sort((a,b)=>a.holdoutStart.localeCompare(b.holdoutStart));
 for(let i=0;i<sorted.length;i++){
  const f=sorted[i];if(!validDay(f.trainingEnd)||!validDay(f.holdoutStart)||!validDay(f.holdoutEnd)||
   f.trainingEnd>=f.holdoutStart||f.holdoutEnd<f.holdoutStart||
   (i>0&&sorted[i-1].holdoutEnd>=f.holdoutStart))throw Error('OVERLAPPING_OR_LEAKY_FOLDS');
 }
 const results=sorted.map(x=>replayThreeScanners37({fixture,proposal,trainingEnd:x.trainingEnd,
  holdoutStart:x.holdoutStart,holdoutEnd:x.holdoutEnd,approvedSymbols,everyMinutes}));
 const total=Object.fromEntries(['SCANNER','AI'].map(engine=>[engine,{
  candidateOnly:results.reduce((s,r)=>s+r.comparisons[engine].candidateOnly,0),
  baselineOnly:results.reduce((s,r)=>s+r.comparisons[engine].baselineOnly,0),
  common:results.reduce((s,r)=>s+r.comparisons[engine].common,0)}]));
 return {schemaVersion:'3.7.2-OFFLINE-TWO-ENGINE-WALK-FORWARD-1',folds:results,
  totals:total,trainingDataExcludedFromEvaluation:true,retuneBetweenFolds:false,
  status:results.every(x=>x.status==='SIGNALS_REPLAYED_NO_EXECUTION_EVIDENCE')?'SIGNALS_ONLY':'INCOMPLETE_HISTORICAL_EVIDENCE',
  verifiedBrokerPnL:false,independentlyReviewed:false,canTrade:false,canDeploy:false,applied:false,
  digest:hash([results.map(x=>x.runId),total])};
}
