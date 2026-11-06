/** Read-only candidate ordering for the independent AI PAPER scanner.
 * The per-cycle capacity is a fixed infrastructure limit. No additional quote
 * or bars calls are made simply because a candidate becomes high priority.
 * Oldest-seen-first is the fairness backbone; bounded momentum priority lets
 * a recent fast mover return earlier without starving unobserved symbols.
 */
const valid=x=>Number.isFinite(Number(x))?Number(x):0;
export function planAiAdaptiveBatch37({eligible=[],records={},capacity=12,now=new Date(),cursor=0}={}){
 const universe=[...new Set(eligible.filter(Boolean))];
 const cap=Math.min(universe.length,Math.max(1,Math.floor(Number(capacity)||12)));
 const t=now.getTime();
 const rotation=new Map(universe.map((symbol,i)=>[symbol,(i-(cursor%Math.max(1,universe.length))+universe.length)%universe.length]));
 const candidates=universe.map(symbol=>{
  const prior=records[symbol];
  const age=Math.max(0,(t-Date.parse(prior?.lastSeenAt||''))/60000);
  const missing=!prior?.lastSeenAt||!Number.isFinite(age);
  const f=prior?.latestFeatures||{};
  const momentum=valid(f.momentum5Pct),volume=valid(f.volumeRatio);
  const breakout=valid(f.priorHod)>0&&valid(f.price)>=valid(f.priorHod)*.995;
  // Strong candidates are rescanned more frequently, without exceeding cap.
  const hot=prior&&(prior.pending||prior.state==='SMART'||prior.position?.status==='OPEN')?true:
   momentum>.30&&volume>1.35||breakout&&momentum>.10;
  const elapsed=missing?1e6:age;
  const bonus=hot?Math.min(5,2+Math.max(0,momentum)+Math.max(0,volume-1)):0;
  return {symbol,ageMinutes:missing?null:Number(age.toFixed(2)),hot:!!hot,
   priority:elapsed+bonus,rotation:rotation.get(symbol)};
 });
 candidates.sort((a,b)=>b.priority-a.priority||a.rotation-b.rotation||a.symbol.localeCompare(b.symbol));
 const selected=candidates.slice(0,cap);
 return {batch:selected.map(x=>x.symbol),ranking:selected,
  capacity:cap,eligible:universe.length,unseenCandidates:candidates.filter(x=>x.ageMinutes===null).length,
  hotSelected:selected.filter(x=>x.hot).length,priorityMethod:'STALE_FIRST_WITH_BOUNDED_MOMENTUM_BONUS',
  avoidsAdditionalRequests:true,coverageNotGuaranteedWithout_LiveMetrics:true};
}
