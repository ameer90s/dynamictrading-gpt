/** Isolated, deterministic, offline paired experiment evaluator. Never applies strategies. */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const num=x=>typeof x==='number'&&Number.isFinite(x);
const date=x=>/^20\d\d-\d\d-\d\d$/.test(x||'');
const round=x=>Math.round(x*10000)/10000;
const valid=r=>r&&date(r.day)&&typeof r.tradeId==='string'&&r.tradeId.length>0&&['SCANNER','AI','SCALP'].includes(r.engine)&&['BASELINE','CANDIDATE'].includes(r.variant)&&r.complete===true&&r.authenticQuotes===true&&typeof r.regime==='string'&&r.regime.length>0&&['grossUsd','spreadUsd','feesUsd','slippageUsd','riskUsd'].every(k=>num(r[k]))&&r.spreadUsd>=0&&r.feesUsd>=0&&r.slippageUsd>=0&&r.riskUsd>0;
const net=r=>r.grossUsd-r.spreadUsd-r.feesUsd-r.slippageUsd;
function metrics(rows){let equity=0,peak=0,dd=0;for(const r of rows){equity+=net(r);peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}return {trades:rows.length,netUsd:round(rows.reduce((s,r)=>s+net(r),0)),maxDrawdownUsd:round(dd),costsUsd:round(rows.reduce((s,r)=>s+r.spreadUsd+r.feesUsd+r.slippageUsd,0)),riskUsd:round(rows.reduce((s,r)=>s+r.riskUsd,0))};}
export function runResearchExperiment37({proposal,rows=[],trainingEnd,holdoutStart,holdoutEnd,minimumHoldoutTrades=60,minimumRegimes=2,minimumHoldoutDays=5}={}){
 if(!proposal?.family||!['SCANNER','AI','SCALP'].includes(proposal.engine)||![trainingEnd,holdoutStart,holdoutEnd].every(date)||!(trainingEnd<holdoutStart&&holdoutStart<=holdoutEnd)||!Array.isArray(rows))throw Error('INVALID_EXPERIMENT_SPEC');
 const identity={family:proposal.family,engine:proposal.engine,trainingEnd,holdoutStart,holdoutEnd},issues=[],b=new Map(),c=new Map(),seen=new Set();
 for(const r of rows){if(r?.engine!==proposal.engine)continue;if(!valid(r)){issues.push('INVALID_OR_UNVERIFIED_ROW');continue;}if(r.day>trainingEnd&&r.day<holdoutStart){issues.push('EMBARGO_GAP_ROW');continue;}if(r.day<holdoutStart||r.day>holdoutEnd)continue;
 const key=`${r.day}:${r.tradeId}`,variantKey=`${key}:${r.variant}`;if(seen.has(variantKey)){issues.push('DUPLICATE_TRADE_VARIANT');continue;}seen.add(variantKey);(r.variant==='BASELINE'?b:c).set(key,r);}
 const paired=[];for(const [key,base] of b){const candidate=c.get(key);if(candidate&&candidate.regime===base.regime&&candidate.riskUsd<=base.riskUsd)paired.push({key,base,candidate});else issues.push('UNPAIRED_OR_INCOMPARABLE_DECISION');}
 for(const key of c.keys())if(!b.has(key))issues.push('UNPAIRED_CANDIDATE');paired.sort((a,b)=>a.key.localeCompare(b.key));
 const baseline=metrics(paired.map(x=>x.base)),candidate=metrics(paired.map(x=>x.candidate)),deltaNetUsd=round(candidate.netUsd-baseline.netUsd);
 const regimes=[...new Set(paired.map(x=>x.base.regime))],days=[...new Set(paired.map(x=>x.base.day))];
 const quality=issues.length===0&&paired.length>0&&paired.length===b.size&&paired.length===c.size;
 const enough=paired.length>=minimumHoldoutTrades&&regimes.length>=minimumRegimes&&days.length>=minimumHoldoutDays;
 const improved=deltaNetUsd>0&&candidate.netUsd>0&&candidate.maxDrawdownUsd<=baseline.maxDrawdownUsd&&candidate.riskUsd<=baseline.riskUsd;
 const status=!quality?'INVALID_DATA':!enough?'INSUFFICIENT_HOLDOUT':improved?'PROMISING_REQUIRES_INDEPENDENT_AUDIT':'NO_PROVEN_IMPROVEMENT';
 return {schemaVersion:'3.7-OFFLINE-EXPERIMENT-1',experimentId:`DT37_EXP_${hash([identity,paired]).slice(0,24)}`,identity,status,baseline,candidate,deltaNetUsd,holdoutTrades:paired.length,holdoutDays:days.length,regimes,issues:[...new Set(issues)].sort(),
  limitations:['Paired identical trades cannot measure newly discovered opportunities','Modeled quotes and fills require independent verification','No claim of realized broker P&L'],independentAudit:'NOT_VERIFIED',eligibleForManualApproval:false,applied:false,canDeploy:false,canTrade:false};
}
/** Attach independent experiment evidence to a periodic research artifact.
 * The signal replay is NOT a P&L experiment and cannot set pass or approval.
 * Families and engine scopes must both match to prevent cross-strategy leakage.
 */
export function attachExperimentEvidence37(period,experiments=[]){
 if(!['WEEKLY','MONTHLY'].includes(period?.kind))throw Error('PERIOD_REQUIRED');
 const comparisons=experiments.filter(x=>x?.schemaVersion==='3.7-OFFLINE-EXPERIMENT-1'&&x?.identity?.family);
 const historical=experiments.filter(x=>x?.schemaVersion==='3.7-OFFLINE-THREE-ENGINE-REPLAY-1'&&x?.proposal?.family);
 const engineMatches=(p,engine)=>!Array.isArray(p.engines)||p.engines.includes(engine);
 return {...period,candidates:(period.candidates||[]).map(p=>({
  ...p,
  experimentEvidence:[
   ...comparisons.filter(e=>e.identity.family===p.family&&engineMatches(p,e.identity.engine)).map(e=>({
    id:e.experimentId,engine:e.identity.engine,status:e.status,deltaNetUsd:e.deltaNetUsd,
    verifiedMarketPnl:false,independentAudit:e.independentAudit||'NOT_VERIFIED'})),
   ...historical.filter(e=>e.proposal.family===p.family&&engineMatches(p,e.proposal.engine)).map(e=>({
    id:e.runId,engine:e.proposal.engine,status:e.status,
    candidateOnlySignals:e.comparisons[e.proposal.engine]?.candidateOnly??null,
    baselineOnlySignals:e.comparisons[e.proposal.engine]?.baselineOnly??null,
    verifiedMarketPnl:false,deltaNetUsd:null,independentAudit:e.independentAudit||'NOT_VERIFIED'}))
  ],
  eligibleForProductionApproval:false,canDeploy:false,canTrade:false
 })),experimentsAttached:comparisons.length+historical.length,applied:false,canAutoApply:false};
}
