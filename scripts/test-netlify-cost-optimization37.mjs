import assert from 'node:assert/strict';
import {createPrimaryBarsLoader37,dayFetchStart37} from '../netlify/functions/lib/primary-bars-cache37.mjs';
import {createAiBarsCache37} from '../netlify/functions/lib/ai-bars-cache37.mjs';
import {getPriorAiHistory37} from '../netlify/functions/lib/ai-prior-history-cache37.mjs';
import {fetchAiCycleData} from '../netlify/functions/lib/ai-parallel-data36.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
import {analyzeUniverse} from '../netlify/functions/lib/trading.mjs';
import {earliestOutcomeWindowBySymbol37} from '../netlify/functions/lib/outcome-fetch-plan37.mjs';

let assertions=0;function check(ok,message){assert.ok(ok,message);assertions++;}
const clone=v=>structuredClone(v);
function makeStore(initial={}){
 const map=new Map(Object.entries(initial)),reads=[],writes=[];
 return {map,reads,writes,async get(k){reads.push(k);return clone(map.get(k)??null);},async setJSON(k,v){writes.push(k);map.set(k,clone(v));}};
}
const timeISO=(t)=>new Date(t).toISOString();
const raw=(t,i=0)=>({t:timeISO(t),o:100+i,h:100.2+i,l:99.8+i,c:100.1+i,v:1000+i});
const formatted=(iso,i=0)=>({datetime:iso,open:100+i,high:100.2+i,low:99.8+i,close:100.1+i,volume:1000+i});
function rowsFixture(){
 const x=[];
 for(const d of ['2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-04']){
  for(let i=0;i<80;i++){const hour=13+Math.floor((30+i)/60);const minute=(30+i)%60;
   const off=d.includes('11-')?14:13; // timezone after first Sunday of Nov
   x.push({iso:`${d}T${String(off+Math.floor((30+i)/60)).padStart(2,'0')}:${String((30+i)%60).padStart(2,'0')}:00.000Z`,
           day:d,i:i/100});
  }
 }
 for(let i=0;i<6;i++)x.push({iso:`2026-11-05T14:${String(30+i).padStart(2,'0')}:00.000Z`,day:'2026-11-05',i:i/100});
 return x.sort((a,b)=>a.iso.localeCompare(b.iso));
}
const fixture=rowsFixture();
const fmtNY=(iso)=>{const q=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
 }).formatToParts(new Date(iso)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return `${q.year}-${q.month}-${q.day} ${q.hour}:${q.minute}:00`;
};
const inputBars=fixture.map(x=>({...formatted(fmtNY(x.iso),x.i),utc:x.iso}));
const primaryBars=(start,end)=>inputBars.filter(x=>Date.parse(x.utc)>=+new Date(start)&&Date.parse(x.utc)<=+new Date(end)).map(({utc,...v})=>v);
function baselineFull(sym,key,secret,{lookbackDays=12,now}={}){
 const start=new Date(now.getTime()-lookbackDays*86400e3);return Promise.resolve(primaryBars(start,now));
}
function deltaRange(sym,key,secret,{start,end}={}){return Promise.resolve(primaryBars(start,end));}
// Strict primary parity: source-of-truth history is re-fetched on each cycle.
// A cached, unversioned historical bar can be revised by the provider at any
// time. This is a deliberate safeguard, not a claim of history-fetch savings.
const st=makeStore(),at1=new Date('2026-11-05T14:31:05.000Z'),at2=new Date('2026-11-05T14:35:05.000Z');
let cursor=at1,full=0,range=0;
const f=async(...args)=>{full++;return baselineFull(...args);};
const r=async(...args)=>{range++;return deltaRange(...args);};
const loader=createPrimaryBarsLoader37(st,{nowFn:()=>cursor,fullFetch:f,rangeFetch:r});
check(+dayFetchStart37('2026-11-05')<Date.parse('2026-11-05T05:00:00Z'),'NY day start covers DST');
const before1=await baselineFull('TEST','x','y',{now:at1});
check(JSON.stringify(await loader('TEST'))===JSON.stringify(before1),'primary cold canonical parity');
check(full===1&&range===0,'primary cold uses full canonical source');
check(st.reads.length===0&&st.writes.length===0,'primary strict mode does not spend Blob I/O');
cursor=at2;
const before2=await baselineFull('TEST','x','y',{now:at2});
check(JSON.stringify(await loader('TEST'))===JSON.stringify(before2),'primary warm canonical parity');
check(full===2&&range===0,'primary refreshes source even across cycles');
const nextLoader=createPrimaryBarsLoader37(st,{nowFn:()=>at2,fullFetch:f,rangeFetch:r});
check(JSON.stringify(await nextLoader('TEST'))===JSON.stringify(before2),'primary next serverless invocation canonical parity');
check(full===3&&range===0,'primary strict never serves stale historical cache');
const noStore=createPrimaryBarsLoader37({get:async()=>{throw Error('BLOB_OFFLINE')},setJSON:async()=>{throw Error('BLOB_OFFLINE')}},
 {nowFn:()=>at2,fullFetch:f,rangeFetch:r});
check(JSON.stringify(await noStore('TEST'))===JSON.stringify(before2),'primary remains live when Blob is offline');
const noFeed=createPrimaryBarsLoader37(st,{nowFn:()=>at2,fullFetch:async()=>{throw Error('FEED_OFFLINE')},rangeFetch:r});
await assert.rejects(noFeed('TEST'),/FEED_OFFLINE/);assertions++;
const dateNext=new Date('2026-11-06T14:33:05.000Z');
await createPrimaryBarsLoader37(st,{nowFn:()=>dateNext,fullFetch:f,rangeFetch:r})('TEST');
check(full===5,'primary new NY market day uses canonical source');
const firstOld={datetime:'2026-11-04 09:30:00',open:100,high:100,low:100,close:100,volume:1};
let changed=false;
const revisionSource=async()=>[{...firstOld,close:changed?250:100}];
const rev1=createPrimaryBarsLoader37(st,{nowFn:()=>at1,fullFetch:revisionSource,rangeFetch:r});
check((await rev1('TEST'))[0].close===100,'provider historical source initial version');
changed=true;
const rev2=createPrimaryBarsLoader37(st,{nowFn:()=>at2,fullFetch:revisionSource,rangeFetch:r});
check((await rev2('TEST'))[0].close===250,'provider historical correction visible next minute');
check(st.reads.length===0&&st.writes.length===0,'primary strict never silently reads cached history');

// Actual primary scanner evaluation: cached history must retain scoring and
// the SMART/CONFIRMED/WAIT decisions (not merely candle array parity).
const prevKey=process.env.ALPACA_API_KEY_ID,prevSecret=process.env.ALPACA_API_SECRET_KEY;
const beforeFetch=globalThis.fetch;
try{
 process.env.ALPACA_API_KEY_ID='OFFLINE_TEST_ONLY';process.env.ALPACA_API_SECRET_KEY='OFFLINE_TEST_ONLY';
 globalThis.fetch=async u=>{
  const url=new URL(String(u));const requested=(url.searchParams.get('symbols')||'').split(',');
  return {ok:true,status:200,json:async()=>({quotes:Object.fromEntries(requested.map(s=>[s,{
   bp:100,ap:100.02,bs:200,as:200,t:new Date().toISOString()}]))})};
 };
 const evalStore=makeStore();
 const cachedLoader=createPrimaryBarsLoader37(evalStore,{nowFn:()=>at2,fullFetch:baselineFull,rangeFetch:deltaRange});
 const unCachedLoader=async sym=>baselineFull(sym,null,null,{now:at2});
 const flags={};
 const legacy=await analyzeUniverse(['TEST'],'',undefined,{},'09:30–10:09','active',{}, {}, {},{barsLoader:unCachedLoader});
 const cached=await analyzeUniverse(['TEST'],'',undefined,{},'09:30–10:09','active',{}, {}, {},{barsLoader:cachedLoader});
 const fields=o=>(o.all||[]).map(x=>({symbol:x.symbol,state:x.recommendationState,reason:x.stateReason,
   score:x.profitPotentialScore,price:x.price,setup:x.metrics?.setupFamily,
   trigger:x.research36?.trigger,entry:x.entryLow,stop:x.stopLoss,t1:x.target1,t2:x.target2,t3:x.target3}));
 check(legacy.scanHealth.failedCount===0&&cached.scanHealth.failedCount===0,
       'primary scanner fixture can analyse every requested symbol');
 check(JSON.stringify(fields(legacy))===JSON.stringify(fields(cached)),'primary scanner recommendation and trading levels identical');
 check(JSON.stringify(legacy.scanHealth)===JSON.stringify(cached.scanHealth),'primary scanner symbol coverage unchanged');
 // A subsequent invocation reads the stored history and still yields same scores.
 const hot=createPrimaryBarsLoader37(evalStore,{nowFn:()=>at2,fullFetch:baselineFull,rangeFetch:deltaRange});
 const again=await analyzeUniverse(['TEST'],'',undefined,{},'09:30–10:09','active',{}, {}, {},{barsLoader:hot});
 check(JSON.stringify(fields(legacy))===JSON.stringify(fields(again)),'primary scanner warm-cache signals unchanged');
}finally{
 globalThis.fetch=beforeFetch;
 if(prevKey===undefined)delete process.env.ALPACA_API_KEY_ID;else process.env.ALPACA_API_KEY_ID=prevKey;
 if(prevSecret===undefined)delete process.env.ALPACA_API_SECRET_KEY;else process.env.ALPACA_API_SECRET_KEY=prevSecret;
}

// Coalescing outcome pulls never coalesces the actual signal state machine.
const windows=earliestOutcomeWindowBySymbol37({
 a:{symbol:'ABC',confirmedSignals:[
  {active:true,confirmedAt:'2026-11-05T14:30:00Z',lastBarAt:'2026-11-05T14:33:00Z'},
  {active:true,confirmedAt:'2026-11-05T14:31:00Z',lastBarAt:'2026-11-05T14:32:00Z'},
  {active:false,confirmedAt:'2026-11-05T14:20:00Z'}]},
 b:{symbol:'XYZ',confirmedSignals:[{followAfterStop:true,confirmedAt:'2026-11-05T14:34:00Z'}]},
 c:{symbol:'ABC',confirmedSignals:[{active:true,confirmedAt:'2026-11-05T14:33:00Z'}]}
});
check(windows.size===2&&windows.get('ABC')==='2026-11-05T14:32:00Z'&&
      windows.get('XYZ')==='2026-11-05T14:34:00Z','outcome fetch coalesces only same-symbol network calls');
check(Date.parse(windows.get('ABC'))<=Date.parse('2026-11-05T14:33:00Z'),
      'independent later signals keep their bars and full-minute gates');

// AI: save checkpoints sparsely, but fetch incremental bars on every call.
const day='2026-11-05';
const aiSource=fixture.filter(x=>x.day===day).map((x,i)=>formatted(fmtNY(x.iso),i/100));
const aiStore=makeStore();let aiNow=at1;const froms=[];
const aiFetch=async(sym,now,env,{start}={})=>{
 const lower=start??new Date(now.getTime()-12*3600e3);froms.push(+new Date(lower));
 return aiSource.filter(x=>Date.parse(x.datetime.replace(' ','T')+'-05:00')>=+new Date(lower)&&
    Date.parse(x.datetime.replace(' ','T')+'-05:00')<=now.getTime());
};
let aiLoader=createAiBarsCache37(aiStore,{fetchBars:aiFetch});
const aiOld=await aiFetch('TEST',at1,{});
check(JSON.stringify(await aiLoader('TEST',at1))===JSON.stringify(aiOld),'AI cold same exact bars as baseline');
check(aiStore.writes.length===1,'AI checkpoint created on first fetch');
aiLoader=createAiBarsCache37(aiStore,{fetchBars:aiFetch});
const aiNew=await aiFetch('TEST',at2,{});
check(JSON.stringify(await aiLoader('TEST',at2))===JSON.stringify(aiNew),'AI delta merge equals full as-of feed');
check(froms.at(-1)>at2.getTime()-12*3600e3,'AI fetch window shortened rather than re-fetching 12 hours');
check(aiStore.writes.length===1,'AI within checkpoint interval avoids extra Blob write');
// A correction within 30-min overlap must overwrite the old candle.
aiSource[0].close+=0.25;
const corrected=await aiFetch('TEST',at2,{});
check(JSON.stringify(await aiLoader('TEST',at2))===JSON.stringify(corrected),'AI overlap incorporates late revisions');
const failAi=createAiBarsCache37(aiStore,{fetchBars:async()=>{throw Error('ALPACA_DOWN')}});
await assert.rejects(failAi('TEST',at2),/ALPACA_DOWN/);assertions++;
const aiAtNewDay=new Date('2026-11-06T14:36:05Z');
await createAiBarsCache37(aiStore,{fetchBars:async()=>[]})('TEST',aiAtNewDay);
check(aiStore.writes.length===2,'AI next NY date resets cache');
// Full 12-hour reconciliation once per 30 minutes (even when checkpoint valid)
// detects retrospective corrections beyond the incremental overlap.
const checkStore=makeStore();
await createAiBarsCache37(checkStore,{fetchBars:aiFetch})('TEST',at1);
const aiLate=new Date('2026-11-05T15:02:05Z');
const checkLater=createAiBarsCache37(checkStore,{fetchBars:aiFetch});
const expectedFull=await aiFetch('TEST',aiLate,{});
const actualFull=await checkLater('TEST',aiLate);
check(JSON.stringify(actualFull)===JSON.stringify(expectedFull),
      'AI periodic full reconciliation yields exact full-day data');
check(froms.at(-1)===aiLate.getTime()-12*3600e3,
      'AI performs full 12h source verification at 30-minute boundary');

// Route-level feed still re-fetches fresh L1 execution quotes, never cache quotes.
const originalFetch=globalThis.fetch,env={ALPACA_API_KEY_ID:'MOCK',ALPACA_API_SECRET_KEY:'MOCK'};
try{
 let quotes=0;globalThis.fetch=async u=>{
   const url=new URL(String(u));
   if(url.pathname.endsWith('/quotes/latest')){quotes++;return {ok:true,status:200,json:async()=>({quotes:{TEST:{bp:100,ap:100.01,bs:10,as:10,t:at2.toISOString()}}})};}
   const start=Date.parse(url.searchParams.get('start')),end=Date.parse(url.searchParams.get('end'));
   const b=fixture.filter(x=>x.day===day&&Date.parse(x.iso)>=start&&Date.parse(x.iso)<=end).map((x,i)=>raw(x.iso,i/100));
   return {ok:true,status:200,json:async()=>({bars:b})};
 };
 const feed0=await fetchAiCycleData(['TEST'],at2,env),s2=makeStore(),feed1=await fetchAiCycleData(['TEST'],at2,env,s2);
 check(JSON.stringify(feed0.bars)===JSON.stringify(feed1.bars),'real AI transport route same bars with cache enabled');
 check(quotes===2&&feed1.quotes.TEST.ask===100.01,'real AI transport fetches fresh quotes both runs');
 // A deterministic end-to-end AI decision must be identical given same bars.
 const shared={dateKey:day,now:at2,minute:576,universe:['TEST'],batch:['TEST'],quotes:feed0.quotes,existing:{records:{}},history:[],approved:['TEST']};
 const a=independentCycle({...shared,barMap:feed0.bars}),b=independentCycle({...shared,barMap:feed1.bars});
 const stableRec=x=>{const {generatedAt,...rest}=x;return rest;};
 check(JSON.stringify(a.state)===JSON.stringify(b.state)&&JSON.stringify(stableRec(a.recommendations))===JSON.stringify(stableRec(b.recommendations)),
       'AI decision parity: states and recommendations unchanged');
}finally{globalThis.fetch=originalFetch;}

// Prior session cache preserves outcome order/values and refreshes at TTL.
const histDay='2026-11-05',histDates=Array.from({length:30},(_,i)=>`2026-10-${String(30-i).padStart(2,'0')}`);
const hs=makeStore(Object.fromEntries(histDates.map((d,i)=>[`ai-parallel-state-${d}`,{
 closedOutcomes:[{closedAt:`${d}T20:00:00Z`,netUsd:i,source:d},{closedAt:`${d}T19:00:00Z`,netUsd:null}]}
])));
const index={days:[histDay,...histDates]};
const hNow=new Date('2026-11-05T15:00:00Z');
const expected=histDates.map((d,i)=>({closedAt:`${d}T20:00:00Z`,netUsd:i,source:d}));
check(JSON.stringify(await getPriorAiHistory37(hs,{day:histDay,index,now:hNow}))===JSON.stringify(expected),'prior history source order exactly retained');
check(hs.reads.filter(x=>x.startsWith('ai-parallel-state-')).length===30,'prior history first cache builds from all 30 states');
check(JSON.stringify(await getPriorAiHistory37(hs,{day:histDay,index,now:new Date(+hNow+60e3)}))===JSON.stringify(expected),'prior history next minute exact cached equality');
check(hs.reads.filter(x=>x.startsWith('ai-parallel-state-')).length===30,'prior history cache avoids 30 extra reads each minute');
hs.map.get(`ai-parallel-state-${histDates[0]}`).closedOutcomes.push({closedAt:`${histDates[0]}T21:00:00Z`,netUsd:100});
const updated=await getPriorAiHistory37(hs,{day:histDay,index,now:new Date(+hNow+6*60e3)});
check(updated.length===31&&updated[1].netUsd===100,'prior history catches late archive change after 5-minute TTL');
const failStore=makeStore(Object.fromEntries(histDates.map((d,i)=>[`ai-parallel-state-${d}`,{
 closedOutcomes:[{closedAt:`${d}T20:00:00Z`,netUsd:i}]}
])));
const failing={...failStore,get:async k=>{if(k===`ai-parallel-state-${histDates[0]}`)throw Error('STORE_ERROR');return failStore.get(k);}};
await getPriorAiHistory37(failing,{day:histDay,index,now:hNow});
check(!failStore.map.has('dt37-ai-prior-history-latest'),'partial historical read not cached as complete');
console.log(JSON.stringify({PASS:true,assertions,primary:{fullCalls:full,deltaCalls:range,historyReused:false},ai:{checkpoints:aiStore.writes.length},historical:{baselineReads:30,cacheReadsAvoidedPerMinute:30},note:'Synthetic local tests; no real Netlify runtime costs measured'},null,2));
