import assert from 'node:assert/strict';
import {fetchAiCycleData} from '../netlify/functions/lib/ai-parallel-data36.mjs';

// Offline provider stub. Real Alpaca/Netlify requests are forbidden in this test.
const savedFetch=globalThis.fetch;
const date='2026-11-06', now=new Date('2026-11-06T15:00:05Z');
const env={ALPACA_API_KEY_ID:'LOCAL_MOCK_ONLY',ALPACA_API_SECRET_KEY:'LOCAL_MOCK_ONLY'};
const raw=[
 {t:'2026-11-06T14:58:00Z',o:100,h:101,l:99,c:100.2,v:1234},
 {t:'2026-11-06T14:59:00Z',o:100.2,h:101,l:99.5,c:100.5,v:1300}
];
let bars=[],quotes=[],quoteResponses=0;
function reset(){bars=[];quotes=[];quoteResponses=0}
globalThis.fetch=async(u)=>{
 const url=new URL(String(u));
 if(url.pathname==='/v2/stocks/quotes/latest'){
  quoteResponses++;
  const syms=url.searchParams.get('symbols')?.split(',')||[];
  quotes.push(syms);
  return {ok:true,status:200,json:async()=>({quotes:Object.fromEntries(syms.map(symbol=>
   [symbol,{bp:100,ap:100.01,bs:100,as:100,t:now.toISOString()}]))})};
 }
 if(url.pathname.startsWith('/v2/stocks/')&&url.pathname.endsWith('/bars')){
  bars.push(decodeURIComponent(url.pathname.split('/')[3]));
  return {ok:true,status:200,json:async()=>({bars:raw})};
 }
 throw Error('Unexpected nonmock URL '+url);
};
try{
 const baseline=await fetchAiCycleData(['AAA','BBB'],now,env);
 assert.deepEqual(Object.keys(baseline.bars).sort(),['AAA','BBB','SPY']);
 assert.equal(quoteResponses,1);
 assert.deepEqual(quotes[0],['AAA','BBB']);
 reset();
 const withDuplicates=await fetchAiCycleData(['AAA','BBB','AAA','AAA','BBB'],now,env);
 assert.deepEqual(withDuplicates,baseline,'duplicate inputs produce identical bars, quotes and failure state');
 assert.equal(quoteResponses,1,'one independent L1 snapshot request per invocation');
 assert.deepEqual(quotes[0],['AAA','BBB'],'no duplicate request symbols');
 assert.deepEqual(bars.sort(),['AAA','BBB','SPY'],'one bars fetch per symbol per invocation');
 reset();
 const follow=await fetchAiCycleData(['AAA','BBB'],now,env);
 assert.deepEqual(follow,baseline,'next invocation still obtains live provider data');
 assert.equal(quoteResponses,1,'L1 quote is not cached across invocations');
 let failed=false;
 globalThis.fetch=async(u)=>{if(String(u).includes('quotes/latest'))return {ok:false,status:503,json:async()=>({message:'DOWN'})};return {ok:true,status:200,json:async()=>({bars:raw})};};
 const outage=await fetchAiCycleData(['AAA','BBB','AAA'],now,env);
 failed=outage.errors.some(x=>x.symbol==='QUOTES');
 assert.ok(failed,'provider failure remains visible; not masked by shared or old quote');
 assert.deepEqual(outage.quotes,{},'no stale quote fallback after provider outage');
 console.log('DT371_REQUEST_DEDUP_PASS: 10 offline parity, quote freshness and failure assertions');
}finally{globalThis.fetch=savedFetch;}
