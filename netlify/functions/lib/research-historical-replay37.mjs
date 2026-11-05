/**
 * Historical point-in-time signal replay for all three engines. OFFLINE ONLY.
 * Uses the real scanner, AI and scalp setup detectors; does not invent Level 1
 * quotes, executions, returns or unobserved trading opportunities.
 * This fixture is a selected-symbol archive, NOT a full-universe replay.
 */
import {createHash} from 'node:crypto';
import {RESEARCH36_POLICY,evaluateResearch36} from './research36.mjs';
import {adaptiveAiPolicy,evaluateIndependentAi,featureSet} from './ai-parallel36.mjs';
import {classifyMarket37} from './ai-research-feedback37.mjs';
import {scalpPolicy37,detectScalpSetup37} from './ai-scalp-paper37.mjs';

const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const num=x=>typeof x==='number'&&Number.isFinite(x);
const iso=x=>/^20\d\d-\d\d-\d\d$/.test(x||'')&&!Number.isNaN(Date.parse(x))&&new Date(`${x}T12:00:00Z`).toISOString().slice(0,10)===x;
const pad=x=>String(x).padStart(2,'0');
const engines=['SCANNER','AI','SCALP'];
const guard={
 SCANNER:{maxSpreadBps:'DECREASE',minClosePosition:'INCREASE',minRetestVolume:'INCREASE',minNetR:'INCREASE',openingDollarVolume:'INCREASE'},
 AI:{maxSpreadBps:'DECREASE',minClosePosition:'INCREASE',retestVolumeMin:'INCREASE',earlyVolumeMin:'INCREASE',minRewardR:'INCREASE'},
 SCALP:{maxSpreadBps:'DECREASE',minVolumeRatio:'INCREASE',minMomentum3Pct:'INCREASE',minNetProfitUsd:'INCREASE',maxQuoteDeviationPct:'DECREASE'}
};
const finiteLiteral=x=>num(x)&&x>0&&x<1e7;
/** Parameter delta is deliberately narrow: never accepts arbitrary research/LLM JavaScript. */
export function validateReplayProposal37(p,trainingEnd,holdoutStart){
 if(!p||!engines.includes(p.engine)||!guard[p.engine]?.[p.parameter]||!iso(p.lockedAt)||
   !iso(trainingEnd)||!iso(holdoutStart)||p.lockedAt>trainingEnd||trainingEnd>=holdoutStart||
   !finiteLiteral(p.delta)||!['INCREASE','DECREASE'].includes(p.direction)||p.direction!==guard[p.engine][p.parameter]||
   typeof p.family!=='string'||!/^DT37_FAMILY_[a-f0-9]{24}$/.test(p.family)||
   typeof p.proposalId!=='string'||p.proposalId.length>96)throw Error('INVALID_OR_UNFROZEN_REPLAY_PROPOSAL');
 if(p.direction==='INCREASE'&&p.delta>0.5 || p.direction==='DECREASE'&&p.delta>0.5)throw Error('CANDIDATE_DELTA_TOO_LARGE');
 return Object.freeze({engine:p.engine,parameter:p.parameter,direction:p.direction,delta:p.delta,
  lockedAt:p.lockedAt,family:p.family,proposalId:p.proposalId});
}
function amendPolicy(base,p){
 if(!p)return base;
 const original=base[p.parameter];
 if(!num(original)||original<=0)throw Error('BASE_POLICY_PARAMETER_UNAVAILABLE');
 const next=p.direction==='INCREASE'?original*(1+p.delta):original*(1-p.delta);
 // Risk parameters must never be weakened and changes cannot bypass original gate.
 if(!(next>0)||p.direction==='INCREASE'&&next<original||p.direction==='DECREASE'&&next>original)
  throw Error('UNSAFE_CANDIDATE_PARAMETER');
 return {...base,[p.parameter]:Number(next.toFixed(7))};
}
function utcForNY(day,minute){
 // Derive US eastern offset on the actual day (DST-safe), not a fixed +4h.
 const noonUTC=new Date(`${day}T16:00:00Z`);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23',minute:'2-digit'}).formatToParts(noonUTC).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const localAt16=Number(parts.hour)*60+Number(parts.minute);
 const offset=16*60-localAt16; // 240 in EDT; 300 in EST
 const [y,m,d]=day.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d,0,minute+offset,5));
}
function normalizeBars37(fixture){
 if(!fixture||typeof fixture!=='object'||!fixture.bars||typeof fixture.bars!=='object'||Array.isArray(fixture.bars))throw Error('HISTORICAL_BAR_ARCHIVE_REQUIRED');
 const entries=new Map(),issues=[];
 for(const [key,raw] of Object.entries(fixture.bars)){
  const match=/^(20\d\d-\d\d-\d\d)\|([A-Z][A-Z0-9.\-]{0,14})$/.exec(key);
  if(!match||!iso(match[1])||!Array.isArray(raw)){issues.push('INVALID_SYMBOL_DAY_KEY');continue;}
  const [,day,symbol]=match,rows=[],seen=new Set();let invalid=false,previous=-1;
  for(const values of raw){
   if(!Array.isArray(values)||values.length<6){invalid=true;break;}
   const [minute,open,high,low,close,volume]=values;
   if(!Number.isInteger(minute)||minute<570||minute>959||
    ![open,high,low,close,volume].every(num)||low<=0||low>Math.min(open,close)||high<Math.max(open,close)||volume<0||
    seen.has(minute)||minute<=previous){invalid=true;break;}
   seen.add(minute);previous=minute;
   rows.push({minute,datetime:`${day} ${pad(Math.floor(minute/60))}:${pad(minute%60)}:00`,open,high,low,close,volume});
  }
  if(invalid){issues.push('INVALID_DUPLICATE_OR_UNSORTED_BARS');continue;}
  entries.set(key,rows);
 }
 return {entries,issues};
}
function recordSet(){return {signals:new Map(),reasons:{},minutesEvaluated:0,quotelessEvaluations:0,missingBenchmark:0,shariaMissing:0,marketUnknown:0};}
function countReason(state,reason){const key=String(reason||'UNKNOWN').slice(0,90);state.reasons[key]=(state.reasons[key]||0)+1;}
function note(state,day,symbol,type,minute,regime){const key=`${day}|${symbol}|${type}`;
 if(!state.signals.has(key))state.signals.set(key,{day,symbol,type,firstSignalMinute:minute,regime});}
function summarySet(s){return {signals:s.signals.size,minutesEvaluated:s.minutesEvaluated,missingBenchmark:s.missingBenchmark,
  shariaMissing:s.shariaMissing,marketUnknown:s.marketUnknown,quotesAvailable:0,realFills:0,
  reasons:Object.fromEntries(Object.entries(s.reasons).sort((a,b)=>b[1]-a[1]).slice(0,15))};}
function compareSets(base,alt){
 const common=[],added=[],removed=[];
 for(const [key,val] of alt.signals)(base.signals.has(key)?common:added).push(val);
 for(const [key,val] of base.signals)if(!alt.signals.has(key))removed.push(val);
 const byRegime={};for(const [label,values] of [['added',added],['removed',removed],['common',common]])
  for(const v of values){const r=byRegime[v.regime]||(byRegime[v.regime]={added:0,removed:0,common:0});r[label]++;}
 return {baseline:summarySet(base),candidate:summarySet(alt),common:common.length,candidateOnly:added.length,baselineOnly:removed.length,
  candidateOnlyExamples:added.slice(0,15),baselineOnlyExamples:removed.slice(0,15),byRegime,
  modeledNetUsd:null,verifiedNetUsd:null,performanceConclusion:'NOT_AVAILABLE_WITHOUT_HISTORICAL_EXECUTABLE_BID_ASK_AND_COMPLETE_UNIVERSE'};
}
/**
 * Inputs: frozen signal policy, archived OHLCV and approved historical Sharia symbols.
 * All observations are as-of completed bars STRICTLY before the evaluation minute.
 * No quote rows are synthesized. Results are coverage/signal differences only.
 */
export function replayThreeScanners37({fixture,proposal,trainingEnd,holdoutStart,holdoutEnd,approvedSymbols=[],everyMinutes=5,maxSymbolDays=250}={}){
 if(!iso(trainingEnd)||!iso(holdoutStart)||!iso(holdoutEnd)||!(trainingEnd<holdoutStart&&holdoutStart<=holdoutEnd)||
  !Number.isInteger(everyMinutes)||everyMinutes<1||everyMinutes>30||!Number.isInteger(maxSymbolDays)||maxSymbolDays<1)
  throw Error('INVALID_REPLAY_WINDOW');
 const locked=validateReplayProposal37(proposal,trainingEnd,holdoutStart);
 const {entries,issues}=normalizeBars37(fixture);
 if(issues.length)throw Error(`INVALID_HISTORICAL_ARCHIVE:${[...new Set(issues)].join(',')}`);
 const dates=[...new Set([...entries.keys()].map(k=>k.split('|')[0]))].sort();
 const evalDates=dates.filter(d=>d>=holdoutStart&&d<=holdoutEnd);
 const shards=[];let skippedNoSPY=0;
 for(const date of evalDates){const spy=entries.get(`${date}|SPY`);
  for(const [key,rows] of entries){if(!key.startsWith(`${date}|`)||key.endsWith('|SPY'))continue;
   if(!spy?.length){skippedNoSPY++;continue;}
   shards.push({day:date,symbol:key.split('|')[1],rows,spy});}}
 if(shards.length>maxSymbolDays)throw Error('MAX_SYMBOL_DAY_BUDGET_EXCEEDED');
 const allow=new Set(approvedSymbols.map(x=>String(x).toUpperCase()));
 const books=Object.fromEntries(engines.map(e=>[e,{BASELINE:recordSet(),CANDIDATE:recordSet()}]));
 const byDay=new Map();for(const sh of shards){const group=byDay.get(sh.day)||[];group.push(sh);byDay.set(sh.day,group);}
 for(const [day,group] of byDay){
  const spies=group[0].spy;
  for(let m=585;m<=959;m+=everyMinutes){
   const now=utcForNY(day,m);
   const spyPrefix=spies.filter(b=>b.minute<m).map(({minute,...bar})=>bar);
   const available=group.map(s=>({...s,prefix:s.rows.filter(b=>b.minute<m).map(({minute,...bar})=>bar)}));
   const features=available.map(s=>featureSet(s.prefix.map(x=>({...x,_time:{day,min:Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))}})),
    spyPrefix.map(x=>({...x,_time:{day,min:Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))}})))).filter(Boolean);
   const market=classifyMarket37(features);
   for(const sh of available){
    if(sh.prefix.length<15)continue;
    const approved=allow.has(sh.symbol);
    const currentFeatures=featureSet(sh.prefix.map(x=>({...x,_time:{day,min:Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))}})),
     spyPrefix.map(x=>({...x,_time:{day,min:Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))}})));
    const dynamic=adaptiveAiPolicy(features,[],m,[]);
    for(const variant of ['BASELINE','CANDIDATE']){
     for(const engine of engines){const rec=books[engine][variant];rec.minutesEvaluated++;
      if(!approved){rec.shariaMissing++;countReason(rec,'HISTORICAL_SHARIA_NOT_VERIFIED');continue;}
      if(engine==='SCANNER'){
       const p=variant==='CANDIDATE'&&locked.engine===engine?amendPolicy(RESEARCH36_POLICY,locked):RESEARCH36_POLICY;
       const x=evaluateResearch36(sh.symbol,sh.prefix,spyPrefix,null,{allowHistorical:true,now,shariaApproved:true,policy:p});
       if(x.openingChecks?.every(v=>v.passed)&&x.confirmationChecks?.every(v=>v.passed))
        note(rec,day,sh.symbol,x.model?.model||'RETEST',m,market.regime);
       countReason(rec,x.reason);
      }else if(engine==='AI'){
       const p=variant==='CANDIDATE'&&locked.engine===engine?{...dynamic,params:amendPolicy(dynamic.params,locked)}:dynamic;
       const x=evaluateIndependentAi(sh.symbol,sh.prefix,spyPrefix,null,{allowHistorical:true,now,approved:true,policy:p});
       if(x.decisionTrace?.eligibleForPending)note(rec,day,sh.symbol,x.setupType||'AI_SETUP',m,market.regime);
       countReason(rec,x.reason);
      }else{
       if(market.regime==='UNKNOWN'){rec.marketUnknown++;countReason(rec,'INSUFFICIENT_CROSS_SECTION');continue;}
       const baseline=scalpPolicy37(market,dynamic),p=variant==='CANDIDATE'&&locked.engine===engine?amendPolicy(baseline,locked):baseline;
       const x=detectScalpSetup37(currentFeatures,market,p);
       if(x.type)note(rec,day,sh.symbol,x.type,m,market.regime);
       countReason(rec,x.reason);
      }
     }
    }
   }
  }
 }
 const comparisons=Object.fromEntries(engines.map(e=>[e,compareSets(books[e].BASELINE,books[e].CANDIDATE)]));
 const archives=Object.fromEntries(evalDates.map(day=>[day,groupStats(day,byDay.get(day)||[])]));
 const coverage={archiveKind:'SELECTED_SYMBOL_DAYS_NOT_FULL_UNIVERSE',archivedSessions:dates.length,
  holdoutSessions:evalDates.length,holdoutSymbolDays:shards.length,missingBenchmarkSymbolDays:skippedNoSPY,
  expectedMinuteResolution:1,replayStrideMinutes:everyMinutes,fullMinuteReplay:everyMinutes===1,
  actualHistoricalL1Quotes:0,actualBrokerFills:0,shariaListedSymbols:allow.size,
  dailyArchive:archives, sourceBarSeries:entries.size, sourceBarDigest:sha(fixture.bars),
  barCompleteness:{symbolDaysWith390Bars:shards.filter(x=>x.rows.length===390).length,
   symbolDaysIncomplete:shards.filter(x=>x.rows.length<390).length}};
 const quality=evalDates.length>=5&&shards.length>=60&&everyMinutes===1&&skippedNoSPY===0;
 return {schemaVersion:'3.7-OFFLINE-THREE-ENGINE-REPLAY-1',runId:`DT37_REPLAY_${sha([locked,trainingEnd,holdoutStart,holdoutEnd,coverage,comparisons]).slice(0,24)}`,
  proposal:locked,trainingEnd,holdoutStart,holdoutEnd,coverage,comparisons,
  status:shards.length===0?'NO_HISTORICAL_HOLDOUT_DATA':!quality?'INCOMPLETE_OR_SPARSE_HOLDOUT':'SIGNALS_REPLAYED_NO_EXECUTION_EVIDENCE',
  signalReplayEvidence:true,executionProfitabilityVerified:false,independentAudit:'NOT_VERIFIED',
  strategyApplied:false,eligibleForProductionApproval:false,
  warning:'A signal is NOT an executed trade; newly discovered symbols outside the candidate-only archive cannot be observed',
  requirementsNotVerified:['HISTORICAL_AUTHENTIC_L1_BID_ASK','BROKER_FILL_REALISM','COMPLETE_ASOF_UNIVERSE','INDEPENDENT_OUT_OF_SAMPLE_AUDIT',
   'SCANNER_AI_SCALP_EXECUTION_PNL_AFTER_ALL_COSTS','NETLIFY_COSTS'],
  assumptions:['Approved symbols are drawn from a local snapshot, historical point-in-time Sharia approval not established',
   'No quotes or fills were invented; no P&L is calculated','Replay stride above 1 minute may miss transient signals']};
}
function groupStats(day,group){return {day,symbols:group.map(x=>x.symbol).sort(),source:'ARCHIVED_ALPACA_OHLCV_CANDIDATES_ONLY'};}
