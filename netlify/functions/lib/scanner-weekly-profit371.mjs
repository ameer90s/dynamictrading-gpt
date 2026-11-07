/**
 * Read-only scenario P/L for the PRIMARY scanner's recorded CONFIRMED signals.
 * There are NO broker fills. Paper assumption: $1000 is split equally between
 * all first-confirmed symbols in one NY trading day. Fractional shares,
 * entry at recorded signal price and first touch of the *recommended* target
 * or stop; execution costs/slippage are unavailable and NOT subtracted.
 * Unresolved, ambiguous, missing, or still-open days cannot be claimed as profit.
 * This code never writes to Blobs and never feeds the trading/learning engines.
 */
export const DAILY_CAPITAL_371=1000;
export const WEEKLY_SUBSCRIPTION_371=10;
export const DAY_NAMES_371=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const DAY_MS=86400000;
export function isDay371(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(`${s}T12:00:00.000Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function monday371(s){
 if(!isDay371(s))throw Error('INVALID_DATE');
 const d=new Date(`${s}T12:00:00.000Z`);
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 return d.toISOString().slice(0,10);
}
export function nextDay371(s,offset){
 if(!isDay371(s)||!Number.isInteger(offset))throw Error('INVALID_DATE');
 return new Date(Date.parse(`${s}T12:00:00.000Z`)+offset*DAY_MS).toISOString().slice(0,10);
}
function nyParts(now){
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const f=Object.fromEntries(fmt.formatToParts(now).map(x=>[x.type,x.value]));
 return {date:`${f.year}-${f.month}-${f.day}`,minute:Number(f.hour)*60+Number(f.minute)};
}
function positive(n){return typeof n==='number'&&Number.isFinite(n)&&n>0;}
function targetOf(sig){
 const raw=String(sig?.recommendedTarget||'').toUpperCase();
 const kind=/\bT[123]\b/.exec(raw)?.[0];
 return kind&&positive(sig[kind.toLowerCase()])?{kind,price:sig[kind.toLowerCase()]}:null;
}
function uniqueConfirmed(dayRecord){
 const map=new Map();
 for(const rec of Object.values(dayRecord?.signals||{})){
  const signals=Array.isArray(rec?.confirmedSignals)?rec.confirmedSignals:[];
  // One primary scanner confirmation per symbol/day, no revalidation duplication.
  for(const sig of signals){
   if(!sig||typeof sig!=='object')continue;
   const symbol=String(rec?.symbol||sig?.symbol||'').toUpperCase();
   if(!symbol||map.has(symbol))continue;
   map.set(symbol,{symbol,signal:sig});
  }
 }
 return [...map.values()].sort((a,b)=>String(a.signal.confirmedAt).localeCompare(String(b.signal.confirmedAt))||a.symbol.localeCompare(b.symbol));
}
export function evaluateSignal371(sig){
 if(!sig||!String(sig.signalId||'').trim()||!Number.isFinite(Date.parse(sig.confirmedAt||''))||
  !positive(sig.entry)||!positive(sig.sl)||!(sig.sl<sig.entry))return {status:'UNPRICED'};
 const target=targetOf(sig);
 if(!target||target.price<=sig.entry)return {status:'UNPRICED'};
 if(sig.ambiguous||sig.finalOutcome==='AMBIGUOUS')return {status:'AMBIGUOUS'};
 const hits=Array.isArray(sig.hits)?sig.hits:[];
 // Tracker emits hits only after confirmation's first full minute. A target hit
 // may precede a later stop; then the paper model exits on first target touch.
 // Intra-minute TARGET + SL is flagged ambiguous upstream; fail closed.
 if(hits.includes(target.kind))return {status:'TARGET',exit:target.price,returnPct:(target.price/sig.entry-1)*100};
 if(hits.includes('SL')||sig.finalOutcome==='SL'||sig.stoppedAfterTarget===true){
  return {status:'STOP',exit:sig.sl,returnPct:(sig.sl/sig.entry-1)*100};
 }
 // An expired signal cannot be priced with its maximum high, final T1, etc.
 if(sig.active||!sig.finalOutcome)return {status:'OPEN'};
 return {status:'NO_EXIT_PRICE'};
}
export function evaluateScannerDay371(date,doc,{now=new Date(),capital=DAILY_CAPITAL_371}={}){
 if(!isDay371(date)||!positive(capital))throw Error('INVALID_DAY_OR_CAPITAL');
 const clock=nyParts(now);
 const basics={date,capital,model:'SIGNAL_ONLY_PAPER',feesIncluded:false};
 if(date>clock.date)return {...basics,status:'FUTURE',pnl:null,count:0,priced:0,unresolved:0};
 // Deliberately wait until after the regular 16:00 ET close (and processing lag).
 if(date===clock.date&&clock.minute<16*60+10)return {...basics,status:'SESSION_OPEN',pnl:null,count:0,priced:0,unresolved:0};
 if(!doc||doc.dateKey!==date||!doc.signals||typeof doc.signals!=='object')return {...basics,status:'MISSING_HISTORY',pnl:null,count:0,priced:0,unresolved:0};
 const trades=uniqueConfirmed(doc),count=trades.length;
 if(!count)return {...basics,status:'NO_RECORDED_CONFIRMED',pnl:0,count,priced:0,unresolved:0};
 const amount=capital/count;
 const details=trades.map(({symbol,signal})=>{
  const x=evaluateSignal371(signal);
  return {symbol,signalId:String(signal.signalId||'MISSING_SIGNAL_ID'),status:x.status,
   allocatedUsd:amount,pnl:x.returnPct===undefined?null:amount*x.returnPct/100};
 });
 const priced=details.filter(x=>x.pnl!==null).length,unresolved=count-priced;
 // A partial day is NOT a finalized trading result. Show only confirmed
 // closed-trade contribution separately, never present it as daily net profit.
 const partialPnl=Math.round((details.reduce((s,x)=>s+(x.pnl??0),0)+Number.EPSILON)*100)/100;
 return {...basics,status:unresolved?'INCOMPLETE':'MODELED',
  pnl:unresolved?null:partialPnl,partialPnl,count,priced,unresolved,
  details};
}
export function summarizeScannerWeek371(week,dayDocs,{now=new Date(),capital=DAILY_CAPITAL_371,subscription=WEEKLY_SUBSCRIPTION_371,commissionPerTrade=0}={}){
 if(!isDay371(week)||monday371(week)!==week||!positive(capital)||!Number.isFinite(subscription)||subscription<0||!Number.isFinite(commissionPerTrade)||commissionPerTrade<0||commissionPerTrade>100)throw Error('INVALID_WEEK');
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 let balance=capital,canRoll=true;
 const days=Array.from({length:5},(_,i)=>{
  const date=nextDay371(week,i);
  // After an unresolved day the actual next-day capital cannot be known.
  if(!canRoll){const observed=evaluateScannerDay371(date,dayDocs?.[i]??null,{now,capital});return {...observed,status:observed.status==='FUTURE'?'FUTURE':'PREVIOUS_DAY_UNVERIFIED',capital:null,openingBalance:null,closingBalance:null,commissionUsd:null,pnl:null};}
  const day=evaluateScannerDay371(date,dayDocs?.[i]??null,{now,capital:balance});
  if(day.pnl===null){canRoll=false;return {...day,openingBalance:round(balance),closingBalance:null,commissionUsd:null};}
  const commission=round(day.priced*commissionPerTrade);
  const dailyNet=round(day.pnl-commission);
  const closing=round(balance+dailyNet);
  // If costs exhaust capital, no hypothetical negative borrowing.
  if(closing<=0){canRoll=false;return {...day,status:'CAPITAL_EXHAUSTED',openingBalance:round(balance),closingBalance:null,commissionUsd:commission,pnl:null};}
  const result={...day,openingBalance:round(balance),closingBalance:closing,commissionUsd:commission,grossTradingPnl:day.pnl,pnl:dailyNet};
  balance=closing;
  return result;
 });
 const complete=days.every(x=>x.pnl!==null);
 const modeledDays=days.filter(x=>x.pnl!==null).length;
 const gross=modeledDays?round(days.reduce((a,d)=>a+(d.pnl??0),0)):null;
 const net=gross===null?null:round(gross-subscription);
 const finalBalance=complete?round(capital+net):null;
 return {version:'3.7.1',source:'PRIMARY_SCANNER_CONFIRMED_SIGNAL_HISTORY',paperOnly:true,
  week,through:nextDay371(week,4),capitalPerDay:capital,startingCapital:capital,
  commissionPerTrade,commissionAssumption:commissionPerTrade===0?'ZERO_NOT_VERIFIED':'USER_SCENARIO',
  weeklySubscription:subscription,grossPnl:gross,netAfterSubscriptionBeforeExecutionCosts:net,
  finalBalance,modeledDays,complete,notVerifiedDays:days.filter(x=>x.pnl===null).length,
  weeklyReturnPct:net===null?null:100*net/capital,targetPct:2.5,
  targetUsd:capital*0.025,targetReached:complete&&net!==null&&net>=capital*0.025,
  days,limitations:['NO_BROKER_FILLS','ENTRY_AT_SIGNAL_PRICE_NOT_EXECUTION_ASK',
   'FRACTIONAL_DOLLAR_ALLOCATION','COMMISSION_SCENARIO_NOT_VERIFIED','NO_SPREAD_OR_SLIPPAGE',
   'NO_ASSUMED_EXIT_ON_EXPIRED_OR_AMBIGUOUS','AUDIT_MINUTE_COVERAGE_NOT_VERIFIED']};
}
