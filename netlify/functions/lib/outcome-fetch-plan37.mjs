/** Coalesce Alpaca outcome-tracking reads by symbol only, not by signal.
 * The tracker still advances each signal independently using lastBarAt and
 * the first fully completed minute after its own confirmation time. */
export function earliestOutcomeWindowBySymbol37(signalRecords={}){
 const pending=new Map();
 for(const rec of Object.values(signalRecords||{}))for(const sig of (rec.confirmedSignals||[])){
  if(!sig.active&&!sig.followAfterStop&&!sig.followAfterT3)continue;
  const symbol=String(rec.symbol||'').toUpperCase();
  const since=sig.lastBarAt||sig.confirmedAt;
  const prior=pending.get(symbol);
  if(!prior){pending.set(symbol,since);continue;}
  const a=Date.parse(prior),b=Date.parse(since);
  if(!Number.isFinite(a)||Number.isFinite(b)&&b<a)pending.set(symbol,since);
 }
 return pending;
}
