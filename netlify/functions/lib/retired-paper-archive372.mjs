import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const retiredArchiveKey372=day=>`dt372-retired-paper-books-${day}`;
/** Preserve legacy books verbatim once; no new entries, modeled settlement or deletion. */
export async function preserveRetiredBooks372(store,day,state){
 if(state.retiredArchive372)return state;
 const standalone=await store.get(`dt37-standalone-scalp-state-${day}`,{type:'json',consistency:'strong'});
 if(!state.scalp37&&!standalone)return {...state,retiredArchive372:{status:'NO_LEGACY_BOOK',day}};
 const key=retiredArchiveKey372(day),prior=await store.get(key,{type:'json',consistency:'strong'});
 const payload={schema:'DT372-RETIRED-PAPER-1',day,embedded:state.scalp37||null,standalone:standalone||null,
  status:'ARCHIVED_READ_ONLY_UNSETTLED_POSITIONS_NOT_REALIZED',noNewEntries:true};
 if(prior&&digest(prior)!==digest(payload))throw Error('RETIRED_BOOK_CONFLICT_REQUIRES_REVIEW');
 if(!prior){
  const receipt=await store.setJSON(key,payload,{onlyIfNew:true});
  if(receipt?.modified!==false&&(receipt?.modified!==true||!receipt.etag))throw Error('RETIRED_BOOK_WRITE_UNVERIFIED');
 }
 const saved=await store.get(key,{type:'json',consistency:'strong'});
 if(digest(saved)!==digest(payload))throw Error('RETIRED_BOOK_READBACK_FAILED');
 const {scalp37,...rest}=state;
 return {...rest,retiredArchive372:{day,key,digest:digest(payload),status:payload.status}};
}
