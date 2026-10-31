/** Complete per-minute base scanner diagnostic archive, separate from concise cards.
 * Unlike signal-history's 120/90 ring buffers this audit does not trim any
 * discovery record of a completed minute and includes REGULAR/WAIT exclusions.
 */
export async function writeScannerAudit36(store,dateKey,minute,rows,{eligibleCount=0,attempted=[],errors=[]}={}){
 const key=`scanner-audit-${dateKey}-${String(minute).padStart(4,'0')}`;
 const latest=(rows||[]).filter(x=>x?.symbol).map(x=>({symbol:x.symbol,at:x.research36?.features?.completedBarAt||null,
  state:x.recommendationState||'WAIT',reason:x.stateReason||x.research36?.reason||null,
  attempted:true,source:x.research36?.features?.source||null,features:x.research36?.features||null,
  openingChecks:x.research36?.openingChecks||[],confirmationChecks:x.research36?.confirmationChecks||[],executionChecks:x.research36?.executionChecks||[],
  quote:x.research36?.quote||null,price:x.price??null,focusRank:x.focusRank??null,
  observer:'BASE_3.7',confidenceUncalibrated:true}));
 const seen=new Set(latest.map(r=>r.symbol));
 for(const symbol of [...new Set(attempted)].filter(Boolean)){if(!seen.has(symbol))latest.push({symbol,state:'UNRESOLVED',reason:'ATTEMPTED_NO_RESULT',attempted:true,source:null,features:null,openingChecks:[],confirmationChecks:[],executionChecks:[],quote:null,price:null,focusRank:null,observer:'BASE_3.7',confidenceUncalibrated:true});}
 const obj={version:'3.7',day:dateKey,minute,storedAt:new Date().toISOString(),eligibleCount,attemptedSymbols:attempted,
  records:latest,errors,coverage:{attempted:[...new Set(attempted)].length,completed:seen.size,missing:[...new Set(attempted)].filter(x=>!seen.has(x)),unresolvedCount:[...new Set(attempted)].filter(x=>!seen.has(x)).length}};
 await store.setJSON(key,obj);
 return obj;
}
