import {normalizePool,PRICE_CAP,priceBucket} from './dynamic.mjs';
import {collectPremarketQuotes} from './premarket-batch.mjs';
import {fetchLatestQuotes,alpacaConfigured} from './alpaca.mjs';

// Build once per US trading session. A symbol below $200 at session-universe build
// remains eligible for the rest of that session even if it later rises above $200.
// The next session rebuilds eligibility from fresh prices.
export async function getOrBuildSessionUniverse(store,dateKey,shariaSymbols,{force=false}={}){
  const key=`session-universe-${dateKey}`;
  if(!force){const saved=await store.get(key,{type:'json',consistency:'strong'});if(saved?.schemaVersion==='3.5'&&Array.isArray(saved.eligibleSymbols))return saved;}
  const symbols=normalizePool(shariaSymbols);
  if(!symbols.length)return empty(dateKey);
  if(!alpacaConfigured())return { ...empty(dateKey), universeCount:symbols.length, error:'ALPACA_NOT_CONFIGURED' };
  const scan=await collectPremarketQuotes(symbols,{fetchQuotes:fetchLatestQuotes,key:process.env.ALPACA_API_KEY_ID,secret:process.env.ALPACA_API_SECRET_KEY});
  const result=buildSessionUniverseFromScan(dateKey,symbols,scan);
  await store.setJSON(key,result);return result;
}
export function buildSessionUniverseFromScan(dateKey,symbolsInput,scan={}){
  const symbols=normalizePool(symbolsInput);const rows=[];const eligible=[];const bands={'0-4.99':0,'5-9.99':0,'10-200':0};let priced=0;
  for(const symbol of symbols){const q=scan.quotes?.[symbol]||{};const px=Number(q.mid||q.ask||q.bid||0);const known=px>0;const isEligible=known&&px<=PRICE_CAP;if(known)priced++;if(isEligible){eligible.push(symbol);bands[priceBucket(px)]++;}rows.push({symbol,sessionStartPrice:px||null,sessionStartBand:known?priceBucket(px):null,sessionEligible:isEligible,quoteTimestamp:q.timestamp||null});}
  return{schemaVersion:'3.5',dateKey,builtAt:new Date().toISOString(),universeCount:symbols.length,pricedSymbols:priced,quoteCoveragePct:symbols.length?Number((priced/symbols.length*100).toFixed(2)):0,eligibleCount:eligible.length,eligibleSymbols:eligible,priceBands:bands,batchCount:Number(scan.batchCount||0),batchErrors:Array.isArray(scan.errors)?scan.errors:[],retryLog:Array.isArray(scan.retryLog)?scan.retryLog:[],failedSymbols:Array.isArray(scan.failedSymbols)?scan.failedSymbols:[],successfulSymbols:Array.isArray(scan.successfulSymbols)?scan.successfulSymbols:[],coveragePct:Number(scan.coveragePct??(symbols.length?priced/symbols.length*100:100)),rows};
}
function empty(dateKey){return{schemaVersion:'3.5',dateKey,builtAt:new Date().toISOString(),universeCount:0,pricedSymbols:0,quoteCoveragePct:0,eligibleCount:0,eligibleSymbols:[],priceBands:{'0-4.99':0,'5-9.99':0,'10-200':0},batchCount:0,batchErrors:[],retryLog:[],failedSymbols:[],successfulSymbols:[],coveragePct:0,rows:[]};}
