import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monday371,nextDay371,evaluateSignal371,evaluateScannerDay371,summarizeScannerWeek371} from '../netlify/functions/lib/scanner-weekly-profit371.mjs';
import {scannerWeeklyProfit371} from '../netlify/functions/scanner-weekly-profit371.mjs';
import {mondayOf,addDays,currentNewYorkDate} from '../public/weekly-profit-calc371.mjs';
let n=0;
function check(name,fn){fn();n++;console.log('PASS '+name);}
const NOW=new Date('2026-11-07T15:00:00Z');
const makeSig=(id,props={})=>({signalId:id,confirmedAt:'2026-11-06T14:45:00Z',entry:100,sl:98,t1:102,t2:104,t3:106,recommendedTarget:'T2',hits:['T1','T2'],finalOutcome:'T2',active:false,...props});
const doc=(date='2026-11-06',entries=[])=>({dateKey:date,signals:Object.fromEntries(entries.map(([symbol,signal])=>[symbol,{symbol,confirmedSignals:[signal]}]))});
const empty=day=>doc(day,[]);
check('Correct NY week boundaries / DST',()=>{
 assert.equal(monday371('2026-11-07'),'2026-11-02');assert.equal(monday371('2027-01-01'),'2026-12-28');
 assert.equal(mondayOf('2026-11-07'),monday371('2026-11-07'));
 assert.equal(addDays('2026-03-07',7),'2026-03-14');
 assert.equal(currentNewYorkDate(new Date('2026-11-07T02:00:00Z')),'2026-11-06');
 assert.throws(()=>monday371('2026-02-30'));
});
check('Paper first recommended target rather than highest T3',()=>{
 const x=evaluateSignal371(makeSig('s1',{hits:['T1','T2','T3'],finalOutcome:'T3'}));
 assert.equal(x.status,'TARGET');assert.equal(x.exit,104);assert(Math.abs(x.returnPct-4)<1e-9);
});
check('Stop after partial lower target is loss for T3 target',()=>{
 const x=evaluateSignal371(makeSig('s1',{recommendedTarget:'T3',hits:['T1','T2','SL'],finalOutcome:'T2',stoppedAfterTarget:true}));
 assert.equal(x.status,'STOP');assert.equal(x.exit,98);assert(Math.abs(x.returnPct+2)<1e-9);
});
check('Target before subsequent stop is a modeled exit',()=>{
 const x=evaluateSignal371(makeSig('s1',{hits:['T1','T2','SL'],finalOutcome:'T2',stoppedAfterTarget:true}));
 assert.equal(x.status,'TARGET');assert.equal(x.exit,104);
});
check('Same bar target and stop ambiguous is not money',()=>{
 const x=evaluateSignal371(makeSig('s1',{ambiguous:true,hits:['T2','SL'],finalOutcome:'AMBIGUOUS'}));
 assert.equal(x.status,'AMBIGUOUS');assert.equal(x.returnPct,undefined);
});
check('Expired with no target stop has NO known sale price',()=>{
 assert.equal(evaluateSignal371(makeSig('s1',{hits:[],finalOutcome:'EXPIRED'})).status,'NO_EXIT_PRICE');
});
check('Missing target, bad stop, open => unknown',()=>{
 assert.equal(evaluateSignal371(makeSig('s1',{recommendedTarget:'WAIT'})).status,'UNPRICED');
 assert.equal(evaluateSignal371(makeSig('s1',{sl:101})).status,'UNPRICED');
 assert.equal(evaluateSignal371(makeSig('s1',{hits:[],finalOutcome:null,active:true})).status,'OPEN');
});
check('Fixed $1000 split equally between two same-day confirmed signals',()=>{
 const r=evaluateScannerDay371('2026-11-06',doc('2026-11-06', [['AAPL',makeSig('s1')],['MSFT',makeSig('s2',{hits:['SL'],finalOutcome:'SL'})]]),{now:NOW});
 assert.equal(r.count,2);assert.equal(r.priced,2);assert.equal(r.status,'MODELED');assert.equal(r.pnl,10); // $500 *4% plus $500 *-2%
 assert.equal(r.details[0].allocatedUsd,500);
});
check('One confirmed per symbol counted despite duplicate records',()=>{
 const d=doc('2026-11-06',[['AAPL',makeSig('s1')]]);
 d.signals.AAPL.confirmedSignals.push(makeSig('s2',{hits:['SL']}));
 const r=evaluateScannerDay371('2026-11-06',d,{now:NOW});assert.equal(r.count,1);assert.equal(r.pnl,40);
});
check('Unknown signal means no invented full day P/L',()=>{
 const r=evaluateScannerDay371('2026-11-06',doc('2026-11-06',[['A',makeSig('s1')],['B',makeSig('s2',{hits:[],active:false,finalOutcome:'EXPIRED'})]]),{now:NOW});
 assert.equal(r.status,'INCOMPLETE');assert.equal(r.pnl,null);assert.equal(r.partialPnl,20);assert.equal(r.unresolved,1);
});
check('No record is missing, record with no CONFIRMED shows zero only as observed',()=>{
 assert.equal(evaluateScannerDay371('2026-11-06',null,{now:NOW}).pnl,null);
 assert.equal(evaluateScannerDay371('2026-11-06',empty('2026-11-06'),{now:NOW}).status,'NO_RECORDED_CONFIRMED');
});
check('Never display unsettled today / future as realized',()=>{
 assert.equal(evaluateScannerDay371('2026-11-09',empty('2026-11-09'),{now:NOW}).status,'FUTURE');
 assert.equal(evaluateScannerDay371('2026-11-06',doc('2026-11-06',[['A',makeSig('s1')]]),{now:new Date('2026-11-06T18:00:00Z')}).status,'SESSION_OPEN');
});
check('Weekly subtotal labeled incomplete; no phantom 0 for missing day',()=>{
 const week='2026-11-02';const ds=Array.from({length:5},(_,i)=>empty(nextDay371(week,i)));
 ds[4]=doc('2026-11-06',[['A',makeSig('s1')]]);ds[2]=null;
 const r=summarizeScannerWeek371(week,ds,{now:NOW});
 assert.equal(r.grossPnl,0);assert.equal(r.netAfterSubscriptionBeforeExecutionCosts,-10);
 assert.equal(r.modeledDays,2);assert.equal(r.days[4].status,'PREVIOUS_DAY_UNVERIFIED');assert.equal(r.complete,false);assert.equal(r.targetReached,false);
 assert(r.limitations.includes('NO_BROKER_FILLS'));
});
check('All five days complete => compound starting $1000, weekly $10 only once',()=>{
 const week='2026-11-02';const ds=Array.from({length:5},(_,i)=>empty(nextDay371(week,i)));
 ds[4]=doc('2026-11-06',[['A',makeSig('s1')]]);
 const r=summarizeScannerWeek371(week,ds,{now:NOW});
 assert.equal(r.grossPnl,40);assert.equal(r.netAfterSubscriptionBeforeExecutionCosts,30);
 assert.equal(r.weeklyReturnPct,3);assert.equal(r.finalBalance,1030);assert.equal(r.targetReached,true);assert.equal(r.complete,true);
});
check('No money for entirely missing week',()=>{
 const r=summarizeScannerWeek371('2026-11-02',Array(5).fill(null),{now:NOW});
 assert.equal(r.grossPnl,null);assert.equal(r.netAfterSubscriptionBeforeExecutionCosts,null);assert.equal(r.complete,false);
});
check('Daily compounding: Monday loss, Tuesday profit, fees per trade, subscription once',()=>{
 const week='2026-11-02';const ds=Array.from({length:5},(_,i)=>empty(nextDay371(week,i)));
 ds[0]=doc(nextDay371(week,0),[['A',makeSig('s1',{hits:['SL'],finalOutcome:'SL'})]]);
 ds[1]=doc(nextDay371(week,1),[['B',makeSig('s2')]]);
 const r=summarizeScannerWeek371(week,ds,{now:NOW,commissionPerTrade:1});
 assert.equal(r.days[0].openingBalance,1000);assert.equal(r.days[0].closingBalance,979);
 assert.equal(r.days[1].openingBalance,979);assert.equal(r.days[1].grossTradingPnl,39.16);
 assert.equal(r.days[1].closingBalance,1017.16);
 assert.equal(r.finalBalance,1007.16);assert.equal(r.netAfterSubscriptionBeforeExecutionCosts,7.16);
 assert.equal(r.days[4].openingBalance,1017.16);
});
check('Missing Tuesday means no invented Wednesday-Friday capital',()=>{
 const week='2026-11-02';const ds=Array.from({length:5},(_,i)=>empty(nextDay371(week,i)));
 ds[1]=null;
 const r=summarizeScannerWeek371(week,ds,{now:NOW});
 assert.equal(r.complete,false);assert.equal(r.days[1].status,'MISSING_HISTORY');
 assert.equal(r.days[2].status,'PREVIOUS_DAY_UNVERIFIED');assert.equal(r.days[4].pnl,null);
});
const fakeStore=()=>({reads:[],async get(key){this.reads.push(key);if(key==='signal-history-2026-11-06')return doc('2026-11-06',[['A',makeSig('s1')]]);return empty(key.slice(-10));}});
const request=(query='',method='GET')=>new Request(`https://example.test/api/scanner-weekly-profit${query}`,{method});
async function acheck(name,fn){await fn();n++;console.log('PASS '+name);}
await acheck('Endpoint five direct Blob reads only, zero writes, no extra cron',async()=>{
 const store=fakeStore(),response=await scannerWeeklyProfit371(request('?week=2026-11-02'),{store,now:NOW});
 const data=await response.json();assert.equal(response.status,200);assert.equal(store.reads.length,5);
 assert.deepEqual(store.reads,[0,1,2,3,4].map(i=>`signal-history-${nextDay371('2026-11-02',i)}`));
 assert.equal(data.netAfterSubscriptionBeforeExecutionCosts,30);
});
await acheck('Defaults to NY week, no invalid locale assumption',async()=>{
 const store=fakeStore(),response=await scannerWeeklyProfit371(request(),{store,now:NOW});
 assert.equal(response.status,200);assert.equal((await response.json()).week,'2026-11-02');
});
await acheck('Wrong method and bad/old week fail without Blob reads',async()=>{
 const store=fakeStore();
 assert.equal((await scannerWeeklyProfit371(request('', 'POST'),{store,now:NOW})).status,405);
 assert.equal((await scannerWeeklyProfit371(request('?week=2026-02-30'),{store,now:NOW})).status,400);
 assert.equal((await scannerWeeklyProfit371(request('?week=2011-01-03'),{store,now:NOW})).status,400);
 assert.equal(store.reads.length,0);
});
await acheck('Blob outage => no fabricated profits',async()=>{
 const store={async get(){throw Error('OFFLINE');}};
 const response=await scannerWeeklyProfit371(request('?week=2026-11-02'),{store,now:NOW});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'SCANNER_HISTORY_UNAVAILABLE'});
});
check('UI links core endpoint, has no manual P/L entry or other engines',()=>{
 const html=readFileSync('public/index.html','utf8'),js=readFileSync('public/weekly-profit-calc371.mjs','utf8'),sw=readFileSync('public/service-worker.js','utf8');
 assert.equal((html.match(/data-weekly371-row=/g)||[]).length,5);
 assert(html.includes('id="tab-performance"'));assert(html.includes('data-weekly371-refresh'));
 assert(!html.includes('data-weekly371-pnl='));assert(!html.includes('data-weekly371-fee='));
 assert(js.includes('/api/scanner-weekly-profit?week='));assert(js.includes('dynamic-trading:tabchange'));
 assert(!js.includes('localStorage.setItem'));assert(!js.includes('setInterval('));
 assert(sw.includes('weekly-profit-calc371.mjs?v=3'));
});
console.log(`WEEKLY_SCANNER_AUTO_371_PASS ${n}/${n}`);
