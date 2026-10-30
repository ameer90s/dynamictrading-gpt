import {alpacaConfigured,fetchLatestQuotes} from './alpaca.mjs';
import {recommendationWindow} from './time.mjs';

function nyDateKey(now){const s=recommendationWindow(now);return s.dateKey;}
// Fetch only today's bars, not 12 trading days of history for each scan cycle.
export async function getAiBars(symbol,now=new Date(),env=process.env){
 if(!alpacaConfigured(env))throw new Error('ALPACA_MARKET_DATA_UNCONFIGURED');
 const from=new Date(now.getTime()-12*3600e3),to=now.toISOString();
 const url=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
 for(const [k,v] of [['timeframe','1Min'],['start',from.toISOString()],['end',to],['feed','iex'],['sort','asc'],['limit','1000'],['adjustment','raw']])url.searchParams.set(k,v);
 const response=await fetch(url,{headers:{'APCA-API-KEY-ID':env.ALPACA_API_KEY_ID,'APCA-API-SECRET-KEY':env.ALPACA_API_SECRET_KEY,Accept:'application/json'}});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Alpaca ${symbol}: ${data.message||response.status}`);
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const day=nyDateKey(now);
 return (data.bars||[]).map(b=>{const parts=Object.fromEntries(fmt.formatToParts(new Date(b.t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {datetime:`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:00`,open:+b.o,high:+b.h,low:+b.l,close:+b.c,volume:+b.v};})
 .filter(x=>x.datetime.startsWith(day)&&Number.isFinite(x.close)&&x.high>=x.low&&x.low>0);
}
export async function fetchAiCycleData(symbols,now=new Date(),env=process.env){
 const out={},errors=[];const list=[...new Set(['SPY',...symbols])];
 for(let i=0;i<list.length;i+=4){await Promise.all(list.slice(i,i+4).map(async symbol=>{try{out[symbol]=await getAiBars(symbol,now,env);}catch(err){errors.push({symbol,error:String(err.message||err)});}}));}
 let quotes={};try{for(let i=0;i<symbols.length;i+=50)Object.assign(quotes,await fetchLatestQuotes(symbols.slice(i,i+50),env.ALPACA_API_KEY_ID,env.ALPACA_API_SECRET_KEY));}
 catch(err){errors.push({symbol:'QUOTES',error:String(err.message||err)});}
 return {bars:out,quotes,errors};
}
