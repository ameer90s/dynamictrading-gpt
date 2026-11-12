/** Daily recovery index. One read-only provider GET at most per scheduled recovery run.
 * Never issues a provider POST. Bound the index to the documented 30-day retrieval horizon.
 */
const INDEX='dt38-research-pending-days';
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
const daysOld=(day,now)=>Math.floor((Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);
const clean=(days,now)=>[...new Set((Array.isArray(days)?days:[]).filter(d=>validDay(d)&&daysOld(d,now)>=0&&daysOld(d,now)<30))].sort();
export async function registerPendingResearch38({store,day,now=new Date()}={}){
 if(!store||!validDay(day))throw Error('INVALID_RECOVERY_REGISTRATION');
 const existing=await store.get(INDEX,{type:'json',consistency:'strong'});const days=clean([...(existing?.days||[]),day],now);
 await store.setJSON(INDEX,{days,updatedAt:now.toISOString()});
 const saved=await store.get(INDEX,{type:'json',consistency:'strong'});
 if(!saved?.days?.includes(day))throw Error('RECOVERY_INDEX_NOT_PERSISTED');
 return {status:'INDEXED',count:days.length};
}
export async function recoverPendingResearch38({store,env,now=new Date(),currentDay,pollFn}={}){
 if(!store||typeof pollFn!=='function')return {status:'INVALID_RECOVERY_CONTEXT'};
 const index=await store.get(INDEX,{type:'json',consistency:'strong'});const days=clean(index?.days,now);
 // Avoid writing or polling if nothing is indexed. Recovery costs at most one GET/provider request.
 if(!days.length)return {status:'NO_INDEXED_PENDING_REPORT'};
 let retained=[];let selected=null;
 for(const day of days){
  const record=await store.get(`dt37-openai37-review-${day}`,{type:'json',consistency:'strong'});
  const recovery=record?.status==='BACKGROUND_PENDING'||record?.status==='BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED'
   ?record:await store.get(`dt37-openai37-review-recovery-${day}`,{type:'json',consistency:'strong'});
  if(['BACKGROUND_PENDING','BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED'].includes(recovery?.status)&&/^resp_[A-Za-z0-9_-]+$/.test(recovery?.responseId||'')){
   retained.push(day);if(!selected&&day!==currentDay)selected=day;
  }
 }
 if(retained.join(',')!==days.join(',')){
  await store.setJSON(INDEX,{days:retained,updatedAt:now.toISOString()});
 }
 if(!selected)return {status:'NO_OLDER_PENDING_REPORT'};
 const result=await pollFn({store,env,day:selected,now,finalPoll:true});
 // Prune a completed report from the index after the existing persistence guard ran.
 if(['REVIEW_CREATED_NOT_APPLIED','ALREADY_REVIEWED','FAILED_NO_RETRY'].includes(result.status)){
  await store.setJSON(INDEX,{days:retained.filter(x=>x!==selected),updatedAt:now.toISOString()});
 }
 return {...result,recoveredDay:selected};
}
