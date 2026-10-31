/** Incremental, complete-statistics daily index of immutable per-minute audits.
 * All full records remain in scanner-audit-* / ai-parallel-audit-* blobs. The
 * index holds aggregates for EVERY attempted record, plus selected detailed
 * traces and exact raw-record pointers. One ledger per engine per NY session.
 * This prevents a 30-second Netlify scheduled function from fetching 780 blobs.
 * Research only. Never influences either engine's trading decisions.
 */
import {createHash} from 'node:crypto';
const FIELDS=['price','openingReturnPct','openingMomentum5Pct','openingDollarVolume','openingVolRatio','relativeStrengthPct','volumeRatio','rvol','momentum3Pct','momentum5Pct','momentum10Pct','benchmarkMovePct','benchmarkOpeningReturnPct','dollarVolumeLast5','barRangePct','barCount','volume','hodGapPct','retestVolumeRatio','rsi14','atrPct','atr14','atr','closePosition','macdProxy','spreadBps','ageSec'];
const okNum=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const count=(obj,k,n=1)=>{k=String(k||'UNKNOWN').slice(0,75);obj[k]=(obj[k]||0)+n;};
const sh=(v,n=120)=>String(v??'').slice(0,n);
const gates=(r)=>[...(r.openingChecks||[]),...(r.confirmationChecks||[]),...(r.executionChecks||[]),...(r.checks?.opening||[]),...(r.checks?.candidate||[]),...(r.checks?.execution||[]),...(Array.isArray(r.checks)?r.checks:[])];
function quoteOf(q){q=q&&typeof q==='object'?q:{};const bid=okNum(q.bid),ask=okNum(q.ask);
 const spread=okNum(q.spreadBps)??(bid>0&&ask>=bid?10000*(ask-bid)/((bid+ask)/2):null);
 const age=okNum(q.ageSec)??okNum(q.age);
 return {bid,ask,bidSize:okNum(q.bidSize),askSize:okNum(q.askSize),timestamp:q.timestamp||null,
  source:sh(q.source||'UNKNOWN',50),spreadBps:spread,ageSec:age,
  quality:bid>0&&ask>=bid?'VALID':bid!=null||ask!=null?'INVALID':'UNAVAILABLE'};
}
const posOf=r=>r.position&&typeof r.position==='object'?r.position:null;
const idFor=(kind,day,minute,symbol)=>`${kind}:${day}:${String(minute).padStart(4,'0')}:${sh(symbol,15)}`;
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
function detail(r,kind,day,minute){
 const q=quoteOf(r.quote),p=posOf(r),f=r.features&&typeof r.features==='object'?r.features:{};
 const fail=gates(r).filter(g=>g?.passed===false).map(g=>({gate:sh(g.gate||g.name||g.reason,60),reason:sh(g.reason,70),observed:g.observed??null,threshold:g.threshold??null}));
 const signal=kind==='scanner'?(r.state==='CONFIRMED'||r.state==='SMART'):(r.state==='AI_PAPER_CONFIRMED'||r.state==='SMART'||p?.status==='CLOSED');
 const reason=sh(r.reason,90);
 const qualityIssue=q.quality==='INVALID'||/SPREAD|STALE|QUOTE|429|FEED|NO_DATA/.test(reason);
 const type=p?.status==='CLOSED'?'OUTCOME':signal?'SIGNAL':qualityIssue?'QUOTE_OR_DATA':'REJECTION';
 const features=Object.fromEntries(Object.entries(f).filter(([k,v])=>
  ['minute','completedBarAt','barTime','price','vwap','ema12','ema9','ema21','rsi14','volumeRatio','rvol','relativeStrengthPct','momentum3Pct','momentum5Pct','momentum10Pct','openingReturnPct','openingMomentum5Pct','openingDollarVolume','openingVolRatio','benchmarkMovePct','benchmarkOpeningReturnPct','hodGapPct','retestVolumeRatio','closePosition','atr14','atrPct','atr','macdProxy','macd','aboveVwap','green','regimeFromBenchmark','marketRegime','sectorStrengthPct','retestModel','high','low','volume','barCount'].includes(k)
  &&(typeof v==='number'||typeof v==='string'||typeof v==='boolean'||v===null)).slice(0,32));
 return {id:idFor(kind,day,minute,r.symbol),archiveKey:`${kind==='scanner'?'scanner-audit':'ai-parallel-audit'}-${day}-${String(minute).padStart(4,'0')}`,
  day,minute,kind,symbol:sh(r.symbol,15),state:sh(r.state||r.to,35),reason,at:r.at||null,
  type,quote:q,features,failedGates:fail.slice(0,12),allFailedGatesCount:fail.length,
  checksPresent:gates(r).length,
  policy:kind==='ai'?r.policy||null:null,
  pending:kind==='ai'?r.pending||null:null,
  position:p?{id:p.id||null,status:p.status||null,outcome:p.outcome||null,netUsd:okNum(p.netUsd),
    feesUsd:okNum(p.feesUsd),mfePct:okNum(p.mfePct),maePct:okNum(p.maePct),entry:okNum(p.entry),
    stop:okNum(p.stop),target:okNum(p.target),openedAt:p.openedAt||null,closedAt:p.closedAt||null}:null,
  tradePlan:kind==='scanner'?r.tradePlan||null:null,
  setupFamily:kind==='scanner'?r.setupFamily||null:null,
  trigger:kind==='scanner'?r.trigger||null:null,
  riskEvidence:kind==='scanner'?r.riskEvidence||null:null,
  decisionTrace:kind==='ai'?r.decisionTrace||null:null};
}
function qualityOf(r){const q=quoteOf(r.quote);return {
  records:1,missing:q.quality==='UNAVAILABLE'?1:0,valid:q.quality==='VALID'?1:0,invalid:q.quality==='INVALID'?1:0,
  withSize:q.bidSize>0&&q.askSize>0?1:0,withTimestamp:q.timestamp?1:0,withSpread:q.spreadBps!=null?1:0,
  withAge:q.ageSec!=null?1:0,stale:q.ageSec!=null&&q.ageSec>7?1:0,
  wide:q.spreadBps!=null&&q.spreadBps>12?1:0,
  nonIex:q.source&&q.source!=='UNKNOWN'&&!/IEX/i.test(q.source)?1:0};}
export function summarizeMinuteAudit({kind,day,doc}={}){
 if(!['ai','scanner'].includes(kind)||!/^20\d\d-\d\d-\d\d$/.test(day||''))throw Error('LEDGER_BAD_IDENTITY');
 const minute=Number(doc?.minute);if(!Number.isInteger(minute)||minute<570||minute>959)throw Error('LEDGER_BAD_MINUTE');
 const rows=kind==='scanner'?doc.records:doc.snapshots;
 if(!Array.isArray(rows))throw Error('LEDGER_RECORDS_MISSING');
 const states={},reasons={},gatesFail={},sources={},features={},quote={},symbols=[];
 const significant=[];let withChecks=0,withFeature=0,closed=0,netUsd=0,netCount=0;
 for(const r of rows){if(!r||!r.symbol)continue;
  const state=r.state||r.to||'UNKNOWN',reason=r.reason||'UNSPECIFIED';
  const rowQuote=quoteOf(r.quote);
  symbols.push({s:sh(r.symbol,15),st:sh(state,35),rs:sh(reason,75),q:rowQuote.quality,
   b:rowQuote.bid,a:rowQuote.ask,t:rowQuote.timestamp,src:rowQuote.source,
   outcome:r.position?.status==='CLOSED'?sh(r.position?.outcome||r.position?.finalOutcome||'CLOSED',30):null,
   net:r.position?.status==='CLOSED'?okNum(r.position?.netUsd):null});
  count(states,state);count(reasons,reason);for(const g of gates(r))if(g?.passed===false)count(gatesFail,g.gate||g.name||g.reason);
  if(gates(r).length)withChecks++;
  const f=r.features&&typeof r.features==='object'?r.features:{};
  if(Object.keys(f).length)withFeature++;
  for(const k of FIELDS){const n=okNum(f[k])??(k==='spreadBps'?quoteOf(r.quote).spreadBps:k==='ageSec'?quoteOf(r.quote).ageSec:null);
   if(n!=null){const x=features[k]||(features[k]={count:0,sum:0,min:n,max:n});x.count++;x.sum+=n;x.min=Math.min(x.min,n);x.max=Math.max(x.max,n);}}
  const q=quoteOf(r.quote);const qv=qualityOf(r);for(const [k,v] of Object.entries(qv))quote[k]=(quote[k]||0)+v;
  count(sources,q.source);
  if(r.position?.status==='CLOSED'){closed++;if(okNum(r.position.netUsd)!=null){netUsd+=r.position.netUsd;netCount++;}}
  if(r.state==='SMART'||r.state==='CONFIRMED'||r.state==='AI_PAPER_CONFIRMED'||r.position?.status==='CLOSED'||
   /SPREAD|STALE|QUOTE|429|FAILED|RETEST|HOD/.test(reason))significant.push(detail(r,kind,day,minute));
 }
 const selected=significant.sort((a,b)=>{
  const rank=x=>(x.position?.status==='CLOSED'?1000:0)+(x.state==='CONFIRMED'||x.state==='AI_PAPER_CONFIRMED'?500:0)+
    (x.state==='SMART'?180:0)+(x.type==='QUOTE_OR_DATA'?110:0)+(x.type==='REJECTION'?30:0);
  return rank(b)-rank(a)||a.symbol.localeCompare(b.symbol);
 }).slice(0,5);
 return {minute,archiveKey:`${kind==='scanner'?'scanner-audit':'ai-parallel-audit'}-${day}-${String(minute).padStart(4,'0')}`,
  archiveSha256:hash(doc),status:doc.cycleStatus||'COMPLETED',attemptedSymbols:(doc.attemptedSymbols||doc.coverage?.attemptedSymbols||[]).length||
    (typeof doc.coverage?.attempted==='number'?doc.coverage.attempted:rows.length),
  rowCount:rows.length,states,reasons,gatesFail,sources,features,quote,symbols,examples:selected,
  withChecks,withFeature,closed,netUsd,netCount,at:doc.at||doc.storedAt||null,
  failureReason:doc.cycleStatus==='FAILED'?sh(doc.reason,120):null,
  errors:[...(Array.isArray(doc.errors)?doc.errors:[]),...(Array.isArray(doc.feedErrors)?doc.feedErrors:[])].slice(0,20).map(e=>sh(typeof e==='string'?e:JSON.stringify(e),120)),
  sharia:doc.shariaEvidence?{source:doc.shariaEvidence.source||null,sourceUpdatedAt:doc.shariaEvidence.sourceUpdatedAt||null,
    snapshotSha256:doc.shariaEvidence.snapshotSha256||null,methodology:doc.shariaEvidence.methodology||null}:null,
  transitions:(doc.transitions||[]).length,closedNew:(doc.closedNew||[]).length};
}
/** Hourly shards reduce Blob write amplification (7 shards per stream/day).
 * All seven hours are combined for the one post-close review.
 */
export const researchHours=Object.freeze([9,10,11,12,13,14,15]);
export const ledgerKey=(kind,day,minute)=>`dt37-research-ledger-${kind}-${day}-${String(Math.floor(minute/60)).padStart(2,'0')}`;
export async function recordResearchMinute({store,kind,day,doc}={}){
 const summary=summarizeMinuteAudit({kind,day,doc});const key=ledgerKey(kind,day,summary.minute);
 const prior=await store.get(key,{type:'json',consistency:'strong'});
 if(prior&&prior.kind!==kind)throw Error('LEDGER_KIND_MISMATCH');
 const minutes={...(prior?.minutes||{})};const k=String(summary.minute).padStart(4,'0');
 if(minutes[k]?.archiveSha256===summary.archiveSha256)return {status:'DUPLICATE',minute:summary.minute};
 minutes[k]=summary;
 const updated={schemaVersion:'3.7-RESEARCH-LEDGER-1',kind,day,hour:Math.floor(summary.minute/60),updatedAt:new Date().toISOString(),minutes};
 await store.setJSON(key,updated);
 return {status:'RECORDED',minute:summary.minute,recordCount:summary.rowCount};
}
const toTop=(o,max=20)=>Object.entries(o).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,max).map(([name,count])=>({name,count}));
const mergeCounts=(dst,src)=>{for(const [k,v] of Object.entries(src||{}))dst[k]=(dst[k]||0)+v};
function selectCases(rows,max=20){
 // Stable diversity selection: open/closed paper outcomes, confirmations, rejections,
 // quote problems and both engines. All other raw rows remain in minute archives.
 const perType={OUTCOME:[],SIGNAL:[],QUOTE_OR_DATA:[],REJECTION:[]};const seen=new Set();
 for(const e of rows){if(!perType[e.type]||seen.has(e.id))continue;seen.add(e.id);perType[e.type].push(e);}
 for(const list of Object.values(perType))list.sort((a,b)=>a.minute-b.minute||a.symbol.localeCompare(b.symbol));
 const chosen=[],limits={OUTCOME:8,SIGNAL:7,QUOTE_OR_DATA:4,REJECTION:3};
 for(const type of ['OUTCOME','SIGNAL','QUOTE_OR_DATA','REJECTION']){
  const data=perType[type],step=Math.max(1,Math.floor(data.length/limits[type]));
  for(let i=0;i<data.length&&chosen.filter(x=>x.type===type).length<limits[type];i+=step)chosen.push(data[i]);
 }
 return chosen.slice(0,max).sort((a,b)=>a.minute-b.minute);
}
export function summarizeDailyLedger(ledger){
 if(!ledger||!['ai','scanner'].includes(ledger.kind))throw Error('LEDGER_REQUIRED');
 const byMinute=ledger.minutes||{},minutes=Object.values(byMinute).sort((a,b)=>a.minute-b.minute);
 const counted=new Set(minutes.map(x=>x.minute));const missing=Array.from({length:390},(_,i)=>570+i).filter(m=>!counted.has(m));
 const states={},reasons={},gatesFail={},sources={},quote={},symbols={},features={},cases=[];
 const seen=new Set();let records=0,checks=0,featureRows=0,closed=0,netUsd=0,netCount=0,transitions=0,failed=0,zero=0,errors=0;
 const hours={};const sharia=new Map();
 for(const m of minutes){records+=m.rowCount;checks+=m.withChecks;featureRows+=m.withFeature;closed+=m.closed;
  netUsd+=m.netUsd;netCount+=m.netCount;transitions+=m.transitions;errors+=m.errors.length;
  if(m.status==='FAILED')failed++;if(!m.rowCount&&m.status==='COMPLETED')zero++;
  mergeCounts(states,m.states);mergeCounts(reasons,m.reasons);mergeCounts(gatesFail,m.gatesFail);mergeCounts(sources,m.sources);mergeCounts(quote,m.quote);
  if(m.sharia?.snapshotSha256)sharia.set(m.sharia.snapshotSha256,m.sharia);
  const hour=Math.floor(m.minute/60),bucket=hours[hour]||(hours[hour]={attempted:0,records:0,failed:0});
  bucket.attempted+=m.attemptedSymbols;bucket.records+=m.rowCount;if(m.status==='FAILED')bucket.failed++;
  for(const [key,f] of Object.entries(m.features||{})){
   const p=features[key]||(features[key]={count:0,sum:0,min:f.min,max:f.max});
   p.count+=f.count;p.sum+=f.sum;p.min=Math.min(p.min,f.min);p.max=Math.max(p.max,f.max);
  }
  for(const r of m.symbols||[]){seen.add(r.s);const u=symbols[r.s]||(symbols[r.s]={evaluations:0,firstMinute:m.minute,lastMinute:m.minute,stateCounts:{},reasonCounts:{},outcomeCount:0,netUsd:0});
   u.evaluations++;u.firstMinute=Math.min(u.firstMinute,m.minute);u.lastMinute=Math.max(u.lastMinute,m.minute);
   count(u.stateCounts,r.st);count(u.reasonCounts,r.rs);
   if(r.outcome){u.outcomeCount++;u.netUsd+=r.net||0;}}
  cases.push(...m.examples||[]);
 }
 const topSymbols=Object.entries(symbols).sort((a,b)=>b[1].evaluations-a[1].evaluations).slice(0,25).map(([symbol,s])=>({symbol,...s,
  stateCounts:toTop(s.stateCounts,6),reasonCounts:toTop(s.reasonCounts,6)}));
 const avg=Object.fromEntries(Object.entries(features).map(([k,f])=>[k,{count:f.count,mean:f.count?Number((f.sum/f.count).toFixed(5)):null,min:f.min,max:f.max}]));
 return {kind:ledger.kind,day:ledger.day,expectedMinutes:390,storedMinutes:minutes.length,missingMinutes:missing,failedCycles:failed,
  zeroOpportunityMinutes:zero,attemptedRows:records,uniqueSymbols:seen.size,closedSnapshots:closed,
  // Count repeated CLOSED snapshots as observations, not as unique trades or P&L.
  closedSnapshotNetUsdNotAdditive:netUsd,closedNetObservationCount:netCount,transitions,errors,
  withChecks:checks,withFeature:featureRows,quote,features:avg,
  stateCounts:toTop(states,35),reasonCounts:toTop(reasons,35),failedGates:toTop(gatesFail,35),sources:toTop(sources,12),
  byHour:hours,topSymbols,shariaSnapshots:[...sharia.values()],cases:selectCases(cases),
  recordedMinutesDigest:hash(minutes.map(m=>[m.minute,m.archiveSha256]))};
}
export function pairedDailyResearch(a,b){
 if(!a||!b||a.day!==b.day||a.kind!=='scanner'||b.kind!=='ai')throw Error('LEDGER_PAIR_MISMATCH');
 const s=summarizeDailyLedger(a),ai=summarizeDailyLedger(b),matched=[];
 const am=b.minutes||{};
 let sameSymbolMinute=0,matchingBidAsk=0,askMismatch=0,disagreeState=0,matchingQuoteTimestamps=0,
   comparableQuotePairs=0,matchingPriceAndSourceAndTimestamp=0;
 for(const sc of Object.values(a.minutes||{})){
  const other=am[String(sc.minute).padStart(4,'0')];if(!other)continue;
  const map=new Map((other.symbols||[]).map(r=>[r.s,r]));
  for(const x of (sc.symbols||[])){const y=map.get(x.s);if(!y)continue;sameSymbolMinute++;
   if(x.st!==y.st)disagreeState++;
   const both=x.b>0&&x.a>=x.b&&y.b>0&&y.a>=y.b;
   const priceMatch=both&&Math.abs(x.b-y.b)<0.000001&&Math.abs(x.a-y.a)<0.000001;
   const ageGap=x.t&&y.t&&Number.isFinite(Date.parse(x.t))&&Number.isFinite(Date.parse(y.t))?
     Math.abs(Date.parse(x.t)-Date.parse(y.t))/1000:null;
   const sourceMatch=!!x.src&&x.src===y.src&&x.src!=='UNKNOWN';
   const synchronized=ageGap!=null&&ageGap<=5;
   if(both){comparableQuotePairs++;if(priceMatch)matchingBidAsk++;if(!priceMatch)askMismatch++;
     if(synchronized)matchingQuoteTimestamps++;
     if(priceMatch&&sourceMatch&&synchronized)matchingPriceAndSourceAndTimestamp++;}
   if(matched.length<15)matched.push({minute:sc.minute,symbol:x.s,
    quoteComparable:both,priceMatch:priceMatch||false,sourceMatch,synchronizedQuoteWithin5Sec:synchronized||false,
    quoteTimestampGapSec:ageGap,
    scanner:{state:x.st,reason:x.rs,quoteQuality:x.q,bid:x.b,ask:x.a,source:x.src,timestamp:x.t},
    ai:{state:y.st,reason:y.rs,quoteQuality:y.q,bid:y.b,ask:y.a,source:y.src,timestamp:y.t},
    archiveKeys:[sc.archiveKey,other.archiveKey]});
  }
 }
 const pair={sameSymbolMinute,comparableQuotePairs,matchingBidAsk,askMismatch,disagreeState,
   matchingQuoteTimestamps,matchingPriceAndSourceAndTimestamp,examples:matched,
   quoteComparison:'ACTUAL_RECORDED_L1_PER_SYMBOL_MINUTE_NOT_BROKER_FILL'};
 const combined={dateKey:a.day,sourceId:`DT37_${a.day}`,sourceDigest:hash({scanner:s.recordedMinutesDigest,ai:ai.recordedMinutesDigest}),
  mode:'EVERY_RECORDED_DECISION_AGGREGATED_FROM_MINUTE_ARCHIVE',
  streams:{scanner:s,ai},comparison:pair,
  complete:s.missingMinutes.length===0&&ai.missingMinutes.length===0&&s.failedCycles===0&&ai.failedCycles===0,
  limitations:['Full unabridged row-level evidence is saved in original minute blobs',
   'Selected case studies sent to OpenAI are not all individual rows',
   'No historical NBBO, real fill or post-rejection outcome is inferred without data']};
 return combined;
}

/** Merge hourly shards without inventing any missing minutes. */
export function combineLedgerShards(kind,day,shards=[]){
 if(!['ai','scanner'].includes(kind))throw Error('LEDGER_INVALID_KIND');
 const combined={kind,day,minutes:{},schemaVersion:'3.7-RESEARCH-LEDGER-1'};
 for(const shard of shards){if(!shard)continue;
  if(shard.kind!==kind||shard.day!==day)throw Error('LEDGER_SHARD_IDENTITY_MISMATCH');
  for(const [minute,entry] of Object.entries(shard.minutes||{})){
   if(combined.minutes[minute]&&combined.minutes[minute].archiveSha256!==entry.archiveSha256)
     throw Error('LEDGER_DUPLICATE_MINUTE_CONFLICT');
   combined.minutes[minute]=entry;
  }
 }
 return Object.keys(combined.minutes).length?combined:null;
}
