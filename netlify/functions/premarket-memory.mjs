import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {getShariaUniverse} from './lib/sharia.mjs';
import {fetchLatestQuotes,alpacaConfigured} from './lib/alpaca.mjs';
import {collectPremarketQuotes} from './lib/premarket-batch.mjs';

// Measurement-only pre-market memory. It never feeds ranking/CONFIRMED logic in 4.5.x.
// Every run covers the COMPLETE verified Sharia universe in provider-safe batches.
export default async()=>{
  const clock=recommendationWindow();
  if(!clock.isTradingDay||clock.session!=='PREMARKET')return new Response('Skipped: premarket memory window',{status:200});
  const store=getStore('dynamic-trading');const sharia=await getShariaUniverse(store);const universe=sharia.symbols||[];
  if(!universe.length)return new Response('Premarket memory: no verified Sharia universe',{status:200});
  if(!alpacaConfigured())return new Response('Premarket memory: market quote provider not configured',{status:200});

  const scan=await collectPremarketQuotes(universe,{fetchQuotes:fetchLatestQuotes,key:process.env.ALPACA_API_KEY_ID,secret:process.env.ALPACA_API_SECRET_KEY});
  const rows=scan.symbols.map(symbol=>{const q=scan.quotes[symbol]||{};return{symbol,bid:Number(q.bid||0),ask:Number(q.ask||0),mid:Number(q.mid||0),spreadBps:Number(q.spreadBps||0),timestamp:q.timestamp||null};}).filter(x=>x.mid>0).sort((a,b)=>(a.spreadBps||9999)-(b.spreadBps||9999));
  const key=`premarket-memory-${clock.dateKey}`;const prev=await store.get(key,{type:'json',consistency:'strong'})||{dateKey:clock.dateKey,schemaVersion:'3.5',snapshots:[]};
  prev.snapshots.push({at:new Date().toISOString(),universeCount:universe.length,scannedSymbols:scan.symbols.length,quotedSymbols:rows.length,coveragePct:universe.length?Number((scan.symbols.length/universe.length*100).toFixed(2)):0,batchCount:scan.batchCount,batchErrors:scan.errors,source:sharia.source,rows});
  prev.snapshots=prev.snapshots.slice(-12);prev.updatedAt=new Date().toISOString();prev.mode='MEASUREMENT_ONLY';prev.fullUniverseScan=true;
  await store.setJSON(key,prev);
  return new Response(`Premarket memory ${scan.symbols.length}/${universe.length} Sharia symbols scanned; ${rows.length} quoted; ${scan.errors.length} batch errors`,{status:200});
};
