/** Atomic, first-write-wins claim, only when a new CONFIRMED is detected.
 * Lock is a per-symbol / per-NY-session immutable trading recommendation.
 * No broker execution. No extra remote reads on ordinary WATCH/SMART minutes.
 */
const valid=(x,day,symbol)=>x?.day===day&&x?.symbol===symbol&&x?.signal?.signalId&&
 Number.isFinite(x.signal.entry)&&Number.isFinite(x.signal.sl)&&Number.isFinite(x.signal.t3);
export async function claimFirstConfirmation37(store,day,symbol,row,confirmedAt){
 const key=`dt37-confirmed-once-${day}-${encodeURIComponent(symbol)}`;
 const signal={signalId:`${day}:${symbol}:FIRST_CONFIRMED`,confirmedAt,
  entry:Number(row.price),entryLow:Number(row.entryLow),entryHigh:Number(row.entryHigh),
  t1:Number(row.target1),t2:Number(row.target2),t3:Number(row.target3),
  sl:Number(row.stopLoss),recommendedTarget:row.recommendedTarget||null};
 if(![signal.entry,signal.entryLow,signal.entryHigh,signal.t1,signal.t2,signal.t3,signal.sl].every(Number.isFinite)||
  signal.entry<=0||signal.sl<=0||signal.t3<=signal.entry)throw Error('INVALID_CONFIRMED_FOR_LOCK');
 const existing=await store.get(key,{type:'json',consistency:'strong'});
 if(valid(existing,day,symbol))return {created:false,signal:existing.signal};
 if(existing)throw Error('MALFORMED_CONFIRMATION_LOCK');
 const proposal={day,symbol,signal};
 const result=await store.setJSON(key,proposal,{onlyIfNew:true});
 // A timeout/ambiguous result is NOT an acknowledged first confirmation.
 if(result?.modified!==true&&result?.modified!==false)throw Error('CONFIRMATION_LOCK_WRITE_UNVERIFIED');
 const saved=await store.get(key,{type:'json',consistency:'strong'});
 if(!valid(saved,day,symbol))throw Error('CONFIRMATION_LOCK_READ_UNVERIFIED');
 return {created:result.modified===true,signal:saved.signal};
}
