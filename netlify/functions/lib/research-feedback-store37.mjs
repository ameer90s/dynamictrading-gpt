/**
 * Durable feedback ingestion capability for an explicitly authorized audit flow.
 * Not exposed as an HTTP endpoint, never invoked by OpenAI or a scanner.
 * Requires independent provenance verification, persistent store, and owner authorization.
 */
import {createHash,randomUUID} from 'node:crypto';
import {validateFeedbackEvent37,memoryFromFeedback37,researchMemoryKey37,
 feedbackEventKey37} from './research-memory-cadence37.mjs';
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const read=(s,k)=>s.get(k,{type:'json',consistency:'strong'});
export async function recordTrustedResearchFeedback37({store,event,authorized=false,verifyProvenance}={}){
 if(!authorized||typeof verifyProvenance!=='function'||!store)return {status:'AUTHORIZATION_REQUIRED_NO_WRITE'};
 const parsed=validateFeedbackEvent37(event);
 // Verification must examine evidence outside this module, not just a boolean
 // supplied by a daily LLM suggestion. Caller must have an authenticated owner
 // or independently audited test harness.
 const proof=await verifyProvenance(parsed);
 if(proof?.independentlyConfirmed!==true||proof?.evidenceId!==parsed.sourceEvidenceId)
  return {status:'PROVENANCE_NOT_VERIFIED_NO_WRITE'};
 const e={...parsed,externalProvenanceConfirmed:true};
 const eventId=digest(parsed).slice(0,24),key=feedbackEventKey37(parsed.family,eventId);
 const old=await read(store,key);
 if(old&&digest(old.record)!==digest(e))return {status:'IMMUTABLE_FEEDBACK_CONFLICT_NO_WRITE'};
 if(!old){
  const write=await store.setJSON(key,{eventId,record:e},{onlyIfNew:true});
  const checked=await read(store,key);
  if(checked?.eventId!==eventId||digest(checked.record)!==digest(e)||
    (write?.modified!==true&&write?.modified!==false))return {status:'FEEDBACK_WRITE_NOT_VERIFIED'};
 }
 const existing=await read(store,researchMemoryKey37);
 if(existing&&existing.schemaVersion!=='3.7-PROPOSAL-MEMORY-1')return {status:'MEMORY_CORRUPTED_FAIL_CLOSED'};
 if(existing?.eventIds?.includes(eventId))return {status:'ALREADY_RECORDED',family:parsed.family,verdict:parsed.verdict};
 // Append-only event is canonical; even if snapshot update fails, event is
 // retained for explicit reconciliation, not silently treated as successful.
 const snapshot=memoryFromFeedback37([e],existing),claim=randomUUID();
 const w=await store.setJSON(researchMemoryKey37,{...snapshot,lastSyncClaim:claim},existing?{}:{onlyIfNew:true});
 const after=await read(store,researchMemoryKey37);
 if(w?.modified!==true||after?.lastSyncClaim!==claim||!after?.eventIds?.includes(eventId))
  return {status:'INDEX_UPDATE_UNVERIFIED_NEEDS_RECONCILIATION',eventKey:key};
 return {status:'RECORDED_AND_INDEXED',family:parsed.family,verdict:parsed.verdict,eventKey:key};
}
