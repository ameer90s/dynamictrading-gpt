/** Research-only complete per-minute audit summary. Never places orders or changes scanner decisions.
 * Runs once after the session, and only when the paid research flag is enabled.
 * Missing shards and failed reads are explicitly reported, not called zero trades.
 */
import {createHash} from 'node:crypto';
const fields=['bid','ask','bidSize','askSize','timestamp','source','spreadBps','ageSec'];
const str=(v,n=80)=>String(v??'').slice(0,n);
const obj=v=>v&&typeof v==='object'?v:{};
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const inc=(c,k)=>{const key=str(k||'UNSPECIFIED',80);c[key]=(c[key]||0)+1;};
const entries=c=>Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([name,count])=>({name,count}));
const validMinutes=new Set(Array.from({length:390},(_,i)=>570+i));
const extractMinute=key=>{const m=/-(\d{4})$/.exec(key||'');if(!m)return null;const n=Number(m[1]);return validMinutes.has(n)?n:null;};
function signalRow(row,day,minute,kind){
 const q=obj(row?.quote),f=obj(row?.features),p=obj(row?.position),checks=obj(row?.checks);
 const parsed={id:`${kind}:${day}:${String(minute).padStart(4,'0')}:${str(row?.symbol,12)}`,
   symbol:str(row?.symbol,12),minute,state:str(row?.state||row?.to||row?.recommendationState,30),
   reason:str(row?.reason,80),quote:{},featureSample:{},position:{}};
 for(const k of fields)parsed.quote[k]=q[k]??null;
 for(const k of ['price','openingBars','openingReturnPct','openingDollarVolume','volumeRatio','momentum5Pct','relativeStrengthPct','hodGapPct','rsi14','atrPct'])parsed.featureSample[k]=num(f[k]);
 for(const k of ['status','outcome','entry','netUsd','mfePct','maePct','feesUsd','stop','target'])parsed.position[k]=p[k]??null;
 parsed.failedGates=['opening','candidate','execution'].flatMap(section=>(checks[section]||[]).filter(g=>g?.passed===false).slice(0,3).map(g=>str(g.gate||g.reason,45)));
 return parsed;
}
export async function loadResearchAudit({store,day,limitPerStream=390,parallel=24}={}){
 if(!/^20\d\d-\d\d-\d\d$/.test(day||''))throw Error('AUDIT_BAD_DAY');
 if(typeof store?.list!=='function')throw Error('AUDIT_LIST_REQUIRED');
 const output={dateKey:day,mode:'FULL_PER_MINUTE_ARCHIVE',expectedMinutes:390,complete:false,
   streams:{},comparison:{sameMinuteSameSymbol:0,matchingBothBidAsk:0,differentAskQuotes:0,examples:[]},dataLimitations:['No actual broker fills from OHLCV','IEX L1 is not SIP/NBBO','A missing minute is missing evidence, not a zero-trade cycle']};
 const joinState=new Map();
 for(const [kind,prefix] of [['scanner','scanner-audit'],['ai','ai-parallel-audit']]){
   const listing=await store.list({prefix:`${prefix}-${day}-`});
   const keys=(listing?.blobs||[]).map(x=>x.key).filter(k=>extractMinute(k)!=null).sort();
   if(keys.length>limitPerStream)throw Error('AUDIT_UNBOUNDED_STREAM');
   const summary={kind,listedMinutes:keys.length,storedMinutes:0,missingMinutes:[],readErrors:[],
     zeroRecordMinutes:0,failedCycles:0,attemptedRows:0,uniqueSymbols:0,distinctSymbols:[],
     stateCounts:[],reasonCounts:[],transitionCounts:0,closedPositions:0,
     quote:{present:0,missing:0,validBidAsk:0,withSizes:0,withTimestamp:0,withSpread:0,withAge:0,
       invalidCrossed:0,staleNotVerifiable:0,sourceBreakdown:[]},
     dataQuality:{withFeaturePayload:0,withDecisionChecks:0,withShariaProvenance:0,withCoverage:0,errorCycles:0},
     examples:[],shariaSnapshots:[]};
   const found=new Set(),symbols=new Set(),states={},reasons={},sources={},sharia=new Set();
   const candidateExamples=[];const zeros=[];
   for(let i=0;i<keys.length;i+=parallel){
     const page=await Promise.all(keys.slice(i,i+parallel).map(async key=>{
       try{return {key,doc:await store.get(key,{type:'json',consistency:'strong'})};}
       catch(e){return {key,error:str(e?.message||e,120)};}
     }));
     for(const item of page){
       const minute=extractMinute(item.key);if(item.error||!item.doc){summary.readErrors.push({minute,error:item.error||'MISSING_DOCUMENT'});continue;}
       if(Number(item.doc.minute)!==minute){summary.readErrors.push({minute,error:'MINUTE_KEY_MISMATCH'});continue;}
       found.add(minute);
       const d=item.doc,rows=(kind==='scanner'?d.records:d.snapshots)||[];
       if(!Array.isArray(rows)){summary.readErrors.push({minute,error:'INVALID_RECORD_ARRAY'});continue;}
       if(rows.length===0){summary.zeroRecordMinutes++;if(zeros.length<3)zeros.push({minute,state:'ZERO_SCANNED_RECORDS'});}
       if(d.cycleStatus==='FAILED')summary.failedCycles++;
       const errors=[...(Array.isArray(d.errors)?d.errors:[]),...(Array.isArray(d.feedErrors)?d.feedErrors:[])];
       if(errors.length||d.cycleStatus==='FAILED')summary.dataQuality.errorCycles++;
       if(d.coverage||d.eligibleCount!=null)summary.dataQuality.withCoverage++;
       if(d.shariaEvidence?.snapshotSha256&&d.shariaEvidence?.source){summary.dataQuality.withShariaProvenance++;sharia.add(`${str(d.shariaEvidence.source,50)}:${d.shariaEvidence.snapshotSha256}`)}
       summary.transitionCounts+=(d.transitions||[]).length;
       summary.closedPositions+=(d.closedNew||[]).length;
       for(const r of rows){
         if(r.symbol)symbols.add(str(r.symbol,16));
         if(r.symbol){const jk=`${minute}|${str(r.symbol,16)}`,join=joinState.get(jk)||{};
           join[kind]={state:str(r.state||r.to,30),ask:num(r.quote?.ask),bid:num(r.quote?.bid)};
           joinState.set(jk,join);}
         summary.attemptedRows++;
         inc(states,r.state||r.to||'UNKNOWN');inc(reasons,r.reason||'NO_REASON');
         if(r.features&&typeof r.features==='object')summary.dataQuality.withFeaturePayload++;
         if((r.checks&&typeof r.checks==='object')||(r.openingChecks?.length)||(r.executionChecks?.length))summary.dataQuality.withDecisionChecks++;
         const q=obj(r.quote),bid=num(q.bid),ask=num(q.ask);
         if(!Object.keys(q).length){summary.quote.missing++;}
         else{
           summary.quote.present++;
           if(bid!=null&&ask!=null&&bid>0&&ask>=bid)summary.quote.validBidAsk++;
           if(bid!=null&&ask!=null&&ask<bid)summary.quote.invalidCrossed++;
           if(num(q.bidSize)>0&&num(q.askSize)>0)summary.quote.withSizes++;
           if(q.timestamp)summary.quote.withTimestamp++;
           if(num(q.spreadBps)!=null)summary.quote.withSpread++;
           if(num(q.age)!=null||num(q.ageSec)!=null)summary.quote.withAge++;
           if(!q.timestamp&&!q.ageSec&&!q.age)summary.quote.staleNotVerifiable++;
           inc(sources,q.source||'UNKNOWN');
         }
         if(candidateExamples.length<18&&(r.state==='CONFIRMED'||r.state==='AI_PAPER_CONFIRMED'||r.to==='AI_PAPER_CONFIRMED'||r.reason==='SPREAD_TOO_WIDE'||r.reason==='QUOTE_STALE'||r.position?.status==='CLOSED'))
           candidateExamples.push(signalRow(r,day,minute,kind));
       }
     }
   }
   summary.storedMinutes=found.size;
   summary.missingMinutes=[...validMinutes].filter(m=>!found.has(m));
   summary.uniqueSymbols=symbols.size;summary.distinctSymbols=[...symbols].slice(0,30);
   summary.stateCounts=entries(states);summary.reasonCounts=entries(reasons);summary.quote.sourceBreakdown=entries(sources);
   summary.shariaSnapshots=[...sharia].slice(0,8);
   summary.examples=[...candidateExamples.slice(0,14),...zeros];
   summary.isComplete=found.size===390&&summary.readErrors.length===0;
   output.streams[kind]=summary;
 }
 for(const [key,pair] of joinState){if(!pair.scanner||!pair.ai)continue;
   output.comparison.sameMinuteSameSymbol++;
   if(pair.scanner.ask!=null&&pair.ai.ask!=null&&pair.scanner.bid!=null&&pair.ai.bid!=null){
     output.comparison.matchingBothBidAsk++;
     if(Math.abs(pair.scanner.ask-pair.ai.ask)>0.000001)output.comparison.differentAskQuotes++;
   }
   if(output.comparison.examples.length<8){const [minute,symbol]=key.split('|');output.comparison.examples.push({minute:Number(minute),symbol,scanner:pair.scanner,ai:pair.ai});}
 }
 output.complete=output.streams.scanner.isComplete&&output.streams.ai.isComplete;
 output.totalArchivedMinutes=output.streams.scanner.storedMinutes+output.streams.ai.storedMinutes;
 output.sourceDigest=createHash('sha256').update(JSON.stringify({day,streams:Object.fromEntries(Object.entries(output.streams).map(([k,v])=>[k,{storedMinutes:v.storedMinutes,missingMinutes:v.missingMinutes,states:v.stateCounts,reasons:v.reasonCounts,shariaSnapshots:v.shariaSnapshots}]))})).digest('hex');
 return output;
}
export function auditResearchReadiness(audit){
 if(!audit?.streams?.ai?.storedMinutes||!audit?.streams?.scanner?.storedMinutes)return {ok:false,reason:'MISSING_BASE_OR_AI_MINUTE_AUDITS'};
 const rows=audit.streams.ai.attemptedRows+audit.streams.scanner.attemptedRows;
 if(audit.streams.ai.attemptedRows<1||audit.streams.scanner.attemptedRows<1)return {ok:false,reason:'NO_RECORDED_STOCK_DECISIONS_IN_BOTH_STREAMS'};
 if(audit.streams.ai.readErrors.length||audit.streams.scanner.readErrors.length)return {ok:false,reason:'AUDIT_READ_ERRORS'};
 return {ok:true,reason:'RECORDED_AUDIT_DATA_PRESENT',complete:audit.complete,coverage:{ai:audit.streams.ai.storedMinutes,scanner:audit.streams.scanner.storedMinutes}};
}
