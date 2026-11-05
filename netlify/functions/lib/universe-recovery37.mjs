/**
 * No network or store writes. Bounded, opt-in recovery planning for missing
 * session-universe quotes. Never replace a previously eligible price/decision.
 */
export function planRecovery(saved, nowMs, {enabled=false,gapMinutes=10,maxSymbols=50,maxRounds=4}={}) {
  if(!enabled)return {allowed:false,reason:'RECOVERY_DISABLED'};
  if(!saved?.dateKey||!Array.isArray(saved.rows))return{allowed:false,reason:'UNIVERSE_UNAVAILABLE'};
  if(!Number.isFinite(nowMs))return{allowed:false,reason:'BAD_CLOCK'};
  const failed=(saved.rows||[]).filter(r=>r?.symbol&&!Number.isFinite(Number(r.sessionStartPrice)) || (r?.symbol&&!(Number(r.sessionStartPrice)>0))).map(r=>r.symbol);
  if(!failed.length)return{allowed:false,reason:'COVERAGE_COMPLETE'};
  if((saved.recovery?.rounds||0)>=maxRounds)return{allowed:false,reason:'RECOVERY_BUDGET_EXHAUSTED'};
  if(saved.recovery?.lastAttemptAt){const last=Date.parse(saved.recovery.lastAttemptAt);
    if(Number.isFinite(last)&&nowMs-last<gapMinutes*60000)return{allowed:false,reason:'RECOVERY_COOLDOWN'};}
  const cursor=Number(saved.recovery?.cursor||0)%failed.length;
  const selected=Array.from({length:Math.min(failed.length,maxSymbols)},(_,i)=>failed[(cursor+i)%failed.length]);
  return {allowed:true,reason:'MISSING_QUOTES',symbols:selected,nextCursor:(cursor+selected.length)%failed.length};
}

export function mergeRecovery(snapshot,quotes,at,{priceCap=200,plan=null,errors=[]}={}) {
  if(!snapshot?.dateKey||!Array.isArray(snapshot.rows))throw Error('UNIVERSE_UNAVAILABLE');
  const rows=snapshot.rows.map(r=>{
    if(Number(r.sessionStartPrice)>0)return {...r};
    const q=quotes?.[r.symbol];const px=Number(q?.mid||q?.ask||q?.bid||0);
    if(!Number.isFinite(px)||px<=0)return {...r};
    return {...r,sessionStartPrice:px,sessionStartBand:px<5?'0-4.99':px<10?'5-9.99':'10-200',sessionEligible:px<=priceCap,quoteTimestamp:q?.timestamp||null};
  });
  const eligibleSymbols=rows.filter(r=>r.sessionEligible).map(r=>r.symbol);
  const pricedSymbols=rows.filter(r=>Number(r.sessionStartPrice)>0).length;
  const priceBands={'0-4.99':0,'5-9.99':0,'10-200':0};
  for(const r of rows.filter(r=>r.sessionEligible))priceBands[r.sessionStartBand]++;
  return {...snapshot,rows,pricedSymbols,eligibleSymbols,eligibleCount:eligibleSymbols.length,priceBands,
    quoteCoveragePct:rows.length?Number((pricedSymbols/rows.length*100).toFixed(2)):0,
    failedSymbols:rows.filter(r=>!(Number(r.sessionStartPrice)>0)).map(r=>r.symbol),
    recovery:{...(snapshot.recovery||{}),rounds:(snapshot.recovery?.rounds||0)+1,lastAttemptAt:at,
      cursor:plan?.nextCursor??0,lastAttemptedSymbols:plan?.symbols||[],errors},
  };
}
