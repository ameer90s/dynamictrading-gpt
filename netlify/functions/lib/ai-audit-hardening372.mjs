/** 3.7.2 local safety patch: verify durable per-minute AI audit before state is advanced.
 * Netlify Blobs offers no transaction over independent keys. This module intentionally
 * fails closed on conflicts/readback errors; it does NOT claim distributed locking.
 */
import {createHash} from 'node:crypto';

export const aiAuditKey372=(day,minute)=>{
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(minute)||minute<0||minute>1439)throw Error('AI_AUDIT_INVALID_MINUTE');
 return `ai-parallel-audit-${day}-${String(minute).padStart(4,'0')}`;
};
const hash=doc=>createHash('sha256').update(JSON.stringify(doc)).digest('hex');
export async function verifiedAiMinute372({store,day,minute,doc,recordResearchMinute,kind='ai'}={}){
 if(!store||typeof recordResearchMinute!=='function'||!doc||doc.dateKey!==day||doc.minute!==minute)throw Error('AI_AUDIT_INVALID_INPUT');
 const key=aiAuditKey372(day,minute);
 // Strong read is a conflict check, NOT an atomic compare-and-swap.
 // Use create-only CAS for immutable minute audits, never a last-writer-wins write.
 // A rejected concurrent attempt checks the actual stored content and fails
 // closed if it differs. Retrying the same minute is idempotent.
 if(typeof store.getWithMetadata!=='function')throw Error('AI_AUDIT_VERSIONED_READ_REQUIRED');
 const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
 const prior=current?.data||null;
 if(prior&&hash(prior)!==hash(doc))throw Error('AI_AUDIT_MINUTE_CONFLICT');
 if(!prior){
  const receipt=await store.setJSON(key,doc,{onlyIfNew:true});
  if(receipt?.modified===true&&!receipt.etag)throw Error('AI_AUDIT_WRITE_ETAG_UNVERIFIED');
  if(receipt?.modified!==true&&receipt?.modified!==false)throw Error('AI_AUDIT_WRITE_UNVERIFIED');
 }
 const persisted=await store.get(key,{type:'json',consistency:'strong'});
 if(!persisted||hash(persisted)!==hash(doc))throw Error('AI_AUDIT_READBACK_MISMATCH');
 // Ledger failure must propagate. Do not advance mutable position state or latest.
 await recordResearchMinute({store,kind,day,doc:persisted});
 return {key,digest:hash(persisted),alreadyRecorded:!!prior};
}

/** Read-only reconciliation: distinguish absent, mismatched and failed minutes. */
export async function inspectAiMinutes372({store,day,minutes}={}){
 if(!store||!Array.isArray(minutes)||minutes.length>1440)throw Error('AI_AUDIT_BAD_INSPECTION');
 const output={day,expected:minutes.length,found:0,missing:[],failed:[],readErrors:[],invalid:[]};
 for(const minute of [...new Set(minutes)]){
  const key=aiAuditKey372(day,minute);
  try{
   const d=await store.get(key,{type:'json',consistency:'strong'});
   if(!d){output.missing.push(minute);continue;}
   if(d.dateKey!==day||d.minute!==minute){output.invalid.push(minute);continue;}
   output.found++;
   if(d.cycleStatus==='FAILED'||d.cycleStatus==='DEGRADED')output.failed.push({minute,status:d.cycleStatus,reason:d.reason||null});
  }catch(e){output.readErrors.push({minute,reason:String(e?.message||e).slice(0,120)});}
 }
 output.complete=output.missing.length===0&&output.invalid.length===0&&output.readErrors.length===0&&output.failed.length===0;
 return output;
}
