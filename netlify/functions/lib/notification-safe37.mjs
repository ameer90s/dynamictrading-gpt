/** Noncritical CONFIRMED-only phone notifications, strictly after persistent scan writes. */
export async function dispatchPushSafely37(store,data,day,{sendConfirmedPushes}={}){
 const result={SMART:{sent:0,status:'DISABLED_CONFIRMED_ONLY'}};
 try{
  result.CONFIRMED=typeof sendConfirmedPushes==='function'
    ?await sendConfirmedPushes(store,data,day):{sent:0,status:'NOT_CONFIGURED'};
 }catch(e){
  result.CONFIRMED={sent:0,status:'PUSH_FAILED_NOT_SCAN_FAILED'};
  console.warn('DT37_PUSH_NONCRITICAL_FAILURE','CONFIRMED',String(e?.message||e).slice(0,120));
 }
 return result;
}
