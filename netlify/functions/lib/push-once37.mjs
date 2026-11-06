/** At most one push dispatch attempt per immutable confirmation signal.
 * A provider response cannot make delivery exactly-once: that requires client ACK.
 * Fail closed if Netlify Blob claim outcome is ambiguous.
 */
export async function claimPushAttemptOnce37(store,day,signalId,at=new Date().toISOString()){
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)||!signalId)throw Error('INVALID_PUSH_ONCE_ID');
 const key=`dt37-confirmed-push-once-${day}-${encodeURIComponent(signalId)}`;
 const result=await store.setJSON(key,{day,signalId,at},{onlyIfNew:true});
 if(result?.modified!==true)return {claimed:false,status:result?.modified===false?'ALREADY_CLAIMED':'UNVERIFIED_CLAIM'};
 const saved=await store.get(key,{type:'json',consistency:'strong'});
 if(saved?.day!==day||saved?.signalId!==signalId||saved?.at!==at)return {claimed:false,status:'READ_AFTER_WRITE_NOT_VERIFIED'};
 return {claimed:true,status:'CLAIMED'};
}
