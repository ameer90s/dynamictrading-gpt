/** DT 3.9 research-only audit. No provider calls, trading changes or extra writes. */
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const text=(v,n=120)=>String(v??'').slice(0,n);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const checksOf=r=>[...(r.openingChecks||[]),...(r.confirmationChecks||[]),...(r.executionChecks||[]),...(Array.isArray(r.checks)?r.checks:[])].filter(x=>x&&typeof x==='object');
export function gateEvidence39(row={}){
 const r=object(row),q=object(r.quote),f=object(r.features),all=checksOf(r);
 const failed=all.filter(x=>x.passed===false).map(x=>({gate:text(x.gate||x.name||x.reason||'UNKNOWN',70),reason:text(x.reason||r.reason||'UNSPECIFIED',90),observed:x.observed??null,threshold:x.threshold??null}));
 const unknown=all.filter(x=>x.passed!==true&&x.passed!==false).length;
 const bid=num(q.bid),ask=num(q.ask),age=num(q.ageSec)??num(q.age),spread=num(q.spreadBps)??(bid!==null&&bid>0&&ask!==null&&ask>=bid?10000*(ask-bid)/((ask+bid)/2):null);
 const bidAsk=bid===null&&ask===null?'MISSING':bid!==null&&ask!==null&&bid>0&&ask>=bid?'VALID':'INVALID';
 const bars=num(f.openingBars)??num(f.barCount);
 const reason=text(r.reason||'',100);
 const opening=/INCOMPLETE_OPENING|OPENING_BARS|OPENING_DATA|MISSING_OPENING/i.test(reason)||failed.some(x=>/OPEN|BAR_COUNT|OPENING/i.test(x.gate+' '+x.reason))?'INCOMPLETE':bars===null?'UNVERIFIED':'OBSERVED';
 const dataDefect=opening==='INCOMPLETE'||bidAsk==='INVALID'||/NO_DATA|API_ERROR|FEED_FAIL|429|STALE_QUOTE|WAIT_FRESH_QUOTE|NO_AUTHENTIC|NO_QUOTE|DATA_MISSING/i.test(reason)||(age!==null&&age>7);
 return {schema:'DT39_GATE_EVIDENCE_V1',state:text(r.state||r.recommendationState||'UNKNOWN',35),reason:reason||null,
  checksRecorded:all.length,unknownChecks:unknown,failedGates:failed,opening:{state:opening,bars},
  quote:{status:bidAsk,ageSec:age,spreadBps:spread,source:q.source||null,timestamp:q.timestamp||null,ageVerifiable:age!==null},
  classification:dataDefect?'DATA_OR_OPENING':failed.length?'GATE_REJECTION':r.state==='SMART'||r.state==='CONFIRMED'?'SIGNAL':'UNDETERMINED',
  sourceStatus:{hasFeatures:Object.keys(f).length>0,hasDecisionChecks:all.length>0,hasQuote:Object.keys(q).length>0}};
}
const isoDay=v=>/^20\d\d-\d\d-\d\d$/.test(v||'')?v:null;
const minutes=(v)=>{if(Number.isInteger(v))return v;const ms=Date.parse(v||'');if(!Number.isFinite(ms))return null;const d=new Date(ms);return d.getUTCHours()*60+d.getUTCMinutes();};
const canonSymbol=v=>text(v,15).toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
/** Reconcile only same NY date and ticker; minute is optional, and never guess a match. */
export function reconcileResearch39({scannerRows=[],researchRows=[],positionRows=[]}={}){
 const normalized=scannerRows.filter(x=>x&&x.symbol&&isoDay(x.day)).map(x=>({...x,symbol:canonSymbol(x.symbol),minute:Number(x.minute)}));
 const byKey=new Map();for(const x of normalized){const k=`${x.day}|${x.symbol}`;byKey.set(k,[...(byKey.get(k)||[]),x]);}
 const positions=new Map();for(const x of positionRows){if(!x?.symbol||!isoDay(x.day))continue;const k=`${x.day}|${canonSymbol(x.symbol)}`;positions.set(k,[...(positions.get(k)||[]),x]);}
 return researchRows.map(r=>{
  const day=isoDay(r?.day),symbol=canonSymbol(r?.symbol),k=`${day}|${symbol}`;const same=byKey.get(k)||[];
  const at=Number.isInteger(r?.minute)?r.minute:null;
  const eligible=at===null?same:same.filter(x=>x.minute<=at);
  const latest=eligible.length?Math.max(...eligible.map(x=>x.minute)):null;
  const matches=latest===null?[]:eligible.filter(x=>x.minute===latest);
  const exact=at!==null&&latest===at;
  const positionMatches=positions.get(k)||[];
  const matchStatus=!day||!symbol?'INVALID_KEY':!same.length?'NO_SCANNER_RECORD':at===null?'MISSING_RESEARCH_MINUTE':!matches.length?'NO_ASOF_SCANNER_RECORD':matches.length>1?'AMBIGUOUS':exact?'EXACT_MINUTE':'PRIOR_MINUTE_ONLY';
  return {day,symbol,researchAtMinute:at,researchStatus:text(r?.status||'UNKNOWN',50),matchStatus,
   scannerAtMinute:matches.length===1?latest:null,scannerState:matches.length===1?matches[0].state:null,
   scannerReason:matches.length===1?(matches[0].reason||null):null,
   gateEvidence:matches.length===1?gateEvidence39(matches[0]):null,
   positionStatus:positionMatches.length===0?'NO_POSITION_RECORD':positionMatches.length===1?'ONE_POSITION_RECORD':'MULTIPLE_POSITION_RECORDS',
   reportedPositions:positionMatches.length,actualNetUsd:positionMatches.length===1?num(positionMatches[0].netUsd):null,
   limitation:matchStatus==='EXACT_MINUTE'?'STATUS_MATCH_ONLY_NOT_CAUSAL_PROOF':'NO_EXACT_DECISION_MATCH'};
 });
}
/** Mark-to-market research follow-up; bar timestamp must be later than the decision. No fills are inferred. */
export function attachForwardOutcomes39(scannerRows=[],barsByDaySymbol={}, {horizons=[30,60],roundTripCostBps=20}={}){
 return scannerRows.map(r=>{
  const key=`${r.day}|${canonSymbol(r.symbol)}`,bars=Array.isArray(barsByDaySymbol[key])?barsByDaySymbol[key]:[];
  const decisionMs=Date.parse(r.decisionAt||'');
  if(!Number.isFinite(decisionMs))return {...r,followUp:{status:'NOT_VERIFIED',reason:'DECISION_TIMESTAMP_MISSING'}};
  const future=bars.filter(b=>Number.isFinite(Date.parse(b?.at))&&Date.parse(b.at)>decisionMs&&num(b.open)>0&&num(b.close)>0).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(!future.length)return {...r,followUp:{status:'NOT_VERIFIED',reason:'NO_FUTURE_BARS'}};
  const entry=future[0],entryPx=num(entry.open),outcomes={};
  for(const h of horizons){const target=decisionMs+h*60000;const eligible=future.filter(b=>Date.parse(b.at)<=target);const last=eligible.at(-1);
   if(!last||Date.parse(last.at)<target-120000){outcomes[h]={status:'NOT_VERIFIED',reason:'INSUFFICIENT_HORIZON'};continue;}
   const high=Math.max(...eligible.map(b=>num(b.high)??num(b.close)));const low=Math.min(...eligible.map(b=>num(b.low)??num(b.close)));
   outcomes[h]={status:'SIMULATED_MARK_TO_MARKET',entry:entryPx,exit:num(last.close),grossPct:(num(last.close)/entryPx-1)*100,
    netPct:(num(last.close)/entryPx-1)*100-roundTripCostBps/100,mfePct:(high/entryPx-1)*100,maePct:(low/entryPx-1)*100,
    costAssumptionBps:roundTripCostBps,entryTime:entry.at,exitTime:last.at};
  }
  return {...r,followUp:{status:'RESEARCH_ONLY_NO_REAL_FILL',outcomes}};
 });
}
export function summarizeGateEvidence39(rows=[]){const summary={records:rows.length,byClass:{},failedGates:{},opening:{},quote:{},missingDecisionChecks:0};for(const r of rows){const e=gateEvidence39(r);summary.byClass[e.classification]=(summary.byClass[e.classification]||0)+1;summary.opening[e.opening.state]=(summary.opening[e.opening.state]||0)+1;summary.quote[e.quote.status]=(summary.quote[e.quote.status]||0)+1;if(!e.checksRecorded)summary.missingDecisionChecks++;for(const g of e.failedGates)summary.failedGates[g.gate]=(summary.failedGates[g.gate]||0)+1;}return summary;}

/** Descriptive gate-by-outcome matrix. Only observed pass/fail decisions and complete
 * forward OHLCV horizons qualify. No inferred decisions or imputed outcomes. */
export function gateOutcomeMatrix39(rows=[],{horizon=60}={}){
 const groups=new Map();
 for(const row of rows){
  const outcome=row?.followUp?.outcomes?.[horizon];
  if(outcome?.status!=='SIMULATED_MARK_TO_MARKET'||!Number.isFinite(outcome.netPct))continue;
  const perGate=new Map();
  for(const c of checksOf(row)){
   if(!c?.gate||typeof c.passed!=='boolean')continue;
   const gate=text(c.gate,70),decision=c.passed?'PASS':'FAIL';
   if(!perGate.has(gate))perGate.set(gate,decision);
   else if(perGate.get(gate)!==decision)perGate.set(gate,'CONFLICT');
  }
  for(const [gate,decision] of perGate){
   if(decision==='CONFLICT')continue;
   const key=gate+'|'+decision;
   if(!groups.has(key))groups.set(key,{gate,decision,n:0,wins:0,sumNetPct:0});
   const g=groups.get(key);g.n++;g.wins+=Number(outcome.netPct>0);g.sumNetPct+=outcome.netPct;
  }
 }
 return [...groups.values()].sort((a,b)=>a.gate.localeCompare(b.gate)||a.decision.localeCompare(b.decision))
  .map(x=>({gate:x.gate,decision:x.decision,n:x.n,positiveCount:x.wins,positiveRatePct:Number((100*x.wins/x.n).toFixed(2)),averageNetPct:Number((x.sumNetPct/x.n).toFixed(4)),
    evidence:'SELECTED_OBSERVED_CASES_ONLY_NOT_CAUSAL'}));
}
