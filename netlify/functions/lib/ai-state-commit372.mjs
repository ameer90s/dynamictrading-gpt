/** One CAS state head plus a durable publication outbox. Every restart drains
 * the previous outbox BEFORE computing another decision. No lease or stale lock.
 * Separate audit/materialized keys are idempotent projections, not transactions.
 */
import {createHash} from 'node:crypto';
import {verifiedAiMinute372} from './ai-audit-hardening372.mjs';
import {recordResearchMinute} from './research-ledger37.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const opts={type:'json',consistency:'strong'};
const keyFor=day=>`ai-parallel-state-${day}`;
async function versioned(store,key){
 if(typeof store.getWithMetadata!=='function')throw Error('AI_STATE_CAS_REQUIRED');
 const current=await store.getWithMetadata(key,opts);
 if(current&&(!current.etag||!current.data))throw Error('AI_STATE_VERSION_UNVERIFIED');
 return current;
}
function verified(receipt){
 if(receipt?.modified===false)return false;
 if(receipt?.modified!==true||!receipt.etag)throw Error('AI_STATE_WRITE_UNVERIFIED');
 return true;
}
async function project(store,key,value,commit){
 for(let i=0;i<5;i++){
  const current=await versioned(store,key),old=current?.data;
  if(old?.commitId372===commit.id)return;
  const oldDay=old?.dateKey||old?.day||'',oldMinute=old?.minute??old?.minute372??-1;
  if(oldDay>commit.day||oldDay===commit.day&&oldMinute>commit.minute)return;
  const doc={...value,dateKey:commit.day,minute372:commit.minute,commitId372:commit.id};
  const receipt=await store.setJSON(key,doc,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
  if(verified(receipt))return;
 }
 throw Error('AI_PROJECTION_CONCURRENT_RETRY_EXHAUSTED');
}
async function indexDay(store,day){
 const key='ai-parallel-session-index';
 for(let i=0;i<5;i++){
  const current=await versioned(store,key),old=current?.data||{};
  if(old.days?.includes(day))return;
  const doc={...old,days:[...new Set([day,...(old.days||[])])].sort().reverse().slice(0,45),updatedAt:new Date().toISOString()};
  if(verified(await store.setJSON(key,doc,current?{onlyIfMatch:current.etag}:{onlyIfNew:true})))return;
 }
 throw Error('AI_SESSION_INDEX_CONFLICT');
}
export async function loadAiState372(store,day){
 for(let attempt=0;attempt<5;attempt++){
  const current=await versioned(store,keyFor(day));
  if(!current)return {state:{},etag:null};
  const state=current.data;
  if(state.dateKey&&state.dateKey!==day)throw Error('AI_STATE_DAY_MISMATCH');
  const pending=state.publication372;
  if(!pending)return {state,etag:current.etag};
  if(pending.day!==day||pending.minute!==state.lastMinuteProcessed||pending.id!==hash({audit:pending.audit,recommendations:pending.recommendations,latest:pending.latest}))throw Error('AI_PUBLICATION_CORRUPT');
  await verifiedAiMinute372({store,day,minute:pending.minute,doc:pending.audit,recordResearchMinute});
  await project(store,`ai-parallel-recommendations-${day}`,pending.recommendations,pending);
  await project(store,'ai-parallel-latest',pending.latest,pending);
  await indexDay(store,day);
  const {publication372,...published}=state;
  published.lastPublishedCommit372=pending.id;
  const receipt=await store.setJSON(keyFor(day),published,{onlyIfMatch:current.etag});
  if(verified(receipt))return {state:published,etag:receipt.etag};
 }
 throw Error('AI_PUBLICATION_RETRY_EXHAUSTED');
}
export async function commitAiCycle372({store,day,minute,expectedEtag,state,audit,recommendations,latest}={}){
 if(state.dateKey!==day||audit.dateKey!==day||audit.minute!==minute)throw Error('AI_COMMIT_IDENTITY_MISMATCH');
 const publication372={id:hash({audit,recommendations,latest}),day,minute,audit,recommendations,latest};
 const prepared={...state,lastMinuteProcessed:minute,publication372};
 const receipt=await store.setJSON(keyFor(day),prepared,expectedEtag?{onlyIfMatch:expectedEtag}:{onlyIfNew:true});
 if(!verified(receipt))throw Error('AI_STATE_CHANGED_RETRY_FROM_HEAD');
 const published=await loadAiState372(store,day);
 if(published.state.lastMinuteProcessed<minute||published.state.lastMinuteProcessed===undefined)
  throw Error('AI_COMMIT_READBACK_NOT_VERIFIED');
 if(published.state.lastMinuteProcessed===minute&&published.state.lastPublishedCommit372!==publication372.id)
  throw Error('AI_COMMIT_READBACK_NOT_VERIFIED');
 return published;
}
