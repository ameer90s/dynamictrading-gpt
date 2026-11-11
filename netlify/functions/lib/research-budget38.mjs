/** Bounded SINGLE OpenAI request; keeps original minute archives untouched. */
export const RESEARCH_BUDGET_38=Object.freeze({softChars:80000,hardChars:90000,outputTokens:4000,warningRatio:0.95});
const chars=obj=>JSON.stringify(obj).length;
const copy=obj=>structuredClone(obj);
const caseKey=x=>String(x?.id||x?.archiveKey||'');
const trimCase=c=>({id:c.id,archiveKey:c.archiveKey,minute:c.minute,symbol:c.symbol,state:c.state,
  reason:c.reason,type:c.type,setupFamily:c.setupFamily,
  failedGates:Array.isArray(c.failedGates)?c.failedGates.slice(0,6):c.failedGates,
  quote:c.quote?{source:c.quote.source,bid:c.quote.bid,ask:c.quote.ask,
    spreadBps:c.quote.spreadBps,timestamp:c.quote.timestamp,age:c.quote.age}:null});
/** Pack deterministic evidence for ONE model request, without truncating statistics or metric registry.
 * Full case details and minute records remain stored in their original archive keys.
 * If essential aggregate evidence alone is too large, stop BEFORE an API call.
 */
export function packEvidence38(input,{softChars=80000,hardChars=90000}={}){
 if(!Number.isInteger(softChars)||!Number.isInteger(hardChars)||softChars<1000||hardChars<softChars)throw Error('INVALID_EVIDENCE_BUDGET');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_EVIDENCE');
 const originalChars=chars(input),evidence=copy(input),changes=[];
 if(originalChars<=softChars)return {status:'SINGLE_REQUEST',evidence,originalChars,chars:originalChars,compressed:false,extraPaidCalls:0,changes};
 // Cases are only a sampling of individually archived rows, not population metrics.
 // Preserve the full distributions, exact metrics, provenance and the source archive keys.
 const streams=[evidence.archive?.scanner,evidence.archive?.ai].filter(Boolean);
 const note=(step)=>{changes.push(step);return chars(evidence)<=softChars};
 for(const stream of streams){
   if(Array.isArray(stream.detailedCases))stream.detailedCases=stream.detailedCases.map(trimCase);
 }
 if(note('COMPACT_ARCHIVED_CASE_TRACES'))return finalize();
 // Reduce representative examples in stages, never the underlying all-row aggregate.
 for(const limit of [12,8,4,2,0]){
   for(const stream of streams){if(Array.isArray(stream.detailedCases))stream.detailedCases=stream.detailedCases.slice(0,limit)}
   if(note(`CASE_SAMPLE_LIMIT_${limit}`))return finalize();
 }
 // The scanner signal/AI position lists are additional samples; counts and P&L totals remain.
 for(const limit of [15,8,4,0]){
   if(Array.isArray(evidence.scanner?.signals))evidence.scanner.signals=evidence.scanner.signals.slice(-limit || undefined);
   if(Array.isArray(evidence.ai?.positions))evidence.ai.positions=evidence.ai.positions.slice(-limit || undefined);
   if(limit===0){if(Array.isArray(evidence.scanner?.signals))evidence.scanner.signals=[];
     if(Array.isArray(evidence.ai?.positions))evidence.ai.positions=[];}
   if(note(`POSITION_SIGNAL_SAMPLE_LIMIT_${limit}`))return finalize();
 }
 // The soft limit is advisory: retain essential evidence up to the hard ceiling.
 // Never fail a report that fits the user's approved hard limit.
 if(chars(evidence)<=hardChars)return finalize();
 return {status:'EVIDENCE_ESSENTIAL_DATA_OVER_BUDGET',evidence:null,originalChars,chars:chars(evidence),compressed:true,extraPaidCalls:0,changes};
 function finalize(){
   // Citation registry must only reference case IDs actually present in the compressed payload.
   const cases=streams.flatMap(x=>x.detailedCases||[]);
   const ids=new Set(cases.map(caseKey).filter(Boolean));
   evidence.evidenceIndex=[evidence.sourceId,...(evidence.evidenceIndex||[]).filter(x=>ids.has(String(x)))].filter((x,i,a)=>x&&a.indexOf(x)===i);
   if(changes.length){
     evidence.sourceCompleteness={...evidence.sourceCompleteness,caseSamplesCompressed:true,
       compressedEvidenceNotFullRawRows:true};
     evidence.limitations=[...(evidence.limitations||[]),'Some case-level trace details omitted from model input; original full case records remain in archived source keys.'];
   }
   const resultSize=chars(evidence);
   return resultSize<=hardChars?{status:'SINGLE_REQUEST',evidence,originalChars,chars:resultSize,compressed:changes.length>0,extraPaidCalls:0,changes}:
     {status:'EVIDENCE_ESSENTIAL_DATA_OVER_BUDGET',evidence:null,originalChars,chars:resultSize,compressed:true,extraPaidCalls:0,changes};
 }
}
/** Legacy helper retained for API compatibility, with no split/second request. */
export function planEvidence38(evidence,{softChars=80000,hardChars=90000}={}){
 if(typeof evidence==='string'){
   const length=evidence.length;
   return {status:length<=hardChars?'SINGLE_REQUEST':'EVIDENCE_ESSENTIAL_DATA_OVER_BUDGET',chars:length,parts:length<=hardChars?[evidence]:[],extraPaidCalls:0};
 }
 const result=packEvidence38(evidence,{softChars,hardChars});
 return {...result,parts:result.evidence?[JSON.stringify(result.evidence)]:[]};
}
export function recombineEvidence38(parts){return JSON.parse(parts.join(''));}
