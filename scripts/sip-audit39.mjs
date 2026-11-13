#!/usr/bin/env node
/** DT39 read-only, historical IEX v SIP audit. Not imported by live scanners.
 * Files-only default; optional Alpaca network mode requires explicit --fetch and credentials.
 * No Netlify calls, no side effects except writing caller-chosen local report.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const DELAY_MS=16*60000; // defensive cushion beyond Alpaca's 15m restricted window
const NYC=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function nyStamp(t){const d=new Date(t);if(!Number.isFinite(d.valueOf()))return null;const p=Object.fromEntries(NYC.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;}
function arrayOf(payload,kind){const key=kind==='quotes'?'quotes':'bars';const root=payload?.[key]??payload;const rows=[];if(Array.isArray(root))return root;for(const [s,v] of Object.entries(root||{}))if(Array.isArray(v))rows.push(...v.map(x=>({...x,symbol:x.symbol||s})));return rows;}
function convertBar(x){const timestamp=x.t||x.timestamp;const time=nyStamp(timestamp);const sym=String(x.symbol||x.S||'').toUpperCase();return sym&&time?{symbol:sym,time,timestamp,open:Number(x.o??x.open),high:Number(x.h??x.high),low:Number(x.l??x.low),close:Number(x.c??x.close),volume:Number(x.v??x.volume??0)}:null;}
function convertQuote(x){const timestamp=x.t||x.timestamp;const time=nyStamp(timestamp);const sym=String(x.symbol||x.S||'').toUpperCase();const bid=Number(x.bp??x.bid),ask=Number(x.ap??x.ask);return sym&&time?{symbol:sym,time,timestamp,bid,ask,bidSize:Number(x.bs??x.bidSize??0),askSize:Number(x.as??x.askSize??0)}:null;}
const validBar=x=>x&&[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&x.close>0;
const validQuote=x=>x&&Number.isFinite(x.bid)&&Number.isFinite(x.ask)&&x.bid>0&&x.ask>=x.bid;
export function compareFeeds39({iexBars,sipBars,iexQuotes=[],sipQuotes=[],scannerAudit=[]},{asOf=new Date().toISOString(),minDelayMs=DELAY_MS}={}){
 const cutoff=Date.parse(asOf)-minDelayMs;if(!Number.isFinite(cutoff))throw Error('INVALID_AS_OF');
 const bars=(payload,source)=>arrayOf(payload,'bars').map(convertBar).filter(validBar).map(x=>({...x,source}));
 const quotes=(payload,source)=>arrayOf(payload,'quotes').map(convertQuote).filter(Boolean).map(x=>({...x,source}));
 const rawI=bars(iexBars,'IEX'),rawS=bars(sipBars,'SIP');const rawIQ=quotes(iexQuotes,'IEX'),rawSQ=quotes(sipQuotes,'SIP');
 // Reject future SIP observations instead of silently leaking them into decision-time data.
 const restricted=[...rawS,...rawSQ].filter(x=>Date.parse(x.timestamp)>cutoff);
 if(restricted.length)throw Error(`SIP_TOO_RECENT_${restricted.length}`);
 const byKey=new Map(),key=x=>`${x.time.slice(0,10)}|${x.symbol}`;
 for(const x of [...rawI,...rawS,...rawIQ,...rawSQ])if(x.time.slice(11)>='09:30'&&x.time.slice(11)<='09:44'){
  const k=key(x);if(!byKey.has(k))byKey.set(k,{date:k.slice(0,10),symbol:x.symbol,iexBars:new Map(),sipBars:new Map(),iexQuotes:[],sipQuotes:[]});
  const bucket=byKey.get(k);if(x.source==='IEX'&&'open'in x)bucket.iexBars.set(x.time,x);else if(x.source==='SIP'&&'open'in x)bucket.sipBars.set(x.time,x);else if(x.source==='IEX')bucket.iexQuotes.push(x);else bucket.sipQuotes.push(x);
 }
 const events=Array.isArray(scannerAudit)?scannerAudit:scannerAudit?.records||[];
 const report=[];
 for(const x of [...byKey.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol))){
  const missing=[...x.sipBars.keys()].filter(t=>!x.iexBars.has(t)).map(t=>t.slice(11)).sort();
  const scanner=events.filter(e=>e.symbol===x.symbol&&String(e.date||e.day||e.at||'').slice(0,10)===x.date);
  const quoteStats=rows=>({total:rows.length,valid:rows.filter(validQuote).length,invalid:rows.filter(q=>!validQuote(q)).length});
  const iex=x.iexBars.size,sip=x.sipBars.size;
  // Match research36.mjs openingReady exactly: 09:30 + 09:44 present and >=13 opening bars.
  const actualOpeningReady=m=>m.size>=13&&m.has(`${x.date} 09:30`)&&m.has(`${x.date} 09:44`);
  report.push({date:x.date,symbol:x.symbol,iexOpeningMinutes:iex,sipOpeningMinutes:sip,missingInIexFoundInSip:missing,iexComplete:iex===15,sipComplete:sip===15,iexOpeningGatePass:actualOpeningReady(x.iexBars),sipOpeningGatePass:actualOpeningReady(x.sipBars),sipRescuesOpening:!actualOpeningReady(x.iexBars)&&actualOpeningReady(x.sipBars),iexQuotes:quoteStats(x.iexQuotes),sipQuotes:quoteStats(x.sipQuotes),scannerMatchedRows:scanner.length,scannerReasons:[...new Set(scanner.map(e=>e.reason||e.stateReason).filter(Boolean))],note:'Historical diagnosis only. Missing bars can reflect no trades; quote presence does not prove real-time execution.'});
 }
 return {schema:'DT39_IEX_SIP_HISTORICAL_AUDIT_1',asOf,minimumAgeMinutes:minDelayMs/60000,purpose:'DIAGNOSTIC_ONLY',neverLiveDecision:true,recordCount:report.length,iexIncomplete:report.filter(x=>!x.iexComplete).length,sipRescuesOpening:report.filter(x=>x.sipRescuesOpening).length,sipIncomplete:report.filter(x=>!x.sipComplete).length,rows:report,tradeImpact:'NOT_VERIFIED',confirmedImpact:'NOT_VERIFIED'};
}
async function fetchHistory({symbol,start,end,feed,type,apiKey,secret,request}){
 const page=type==='quotes'?'quotes':'bars';const arr=[];let token=null;
 for(let n=0;n<20;n++){
  const u=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/${page}`);
  u.searchParams.set('feed',feed);u.searchParams.set('start',start);u.searchParams.set('end',end);u.searchParams.set('limit','10000');u.searchParams.set('sort','asc');if(type==='bars')u.searchParams.set('timeframe','1Min');if(token)u.searchParams.set('page_token',token);
  const resp=await request(u,{headers:{'APCA-API-KEY-ID':apiKey,'APCA-API-SECRET-KEY':secret,Accept:'application/json'}});
  if(!resp.ok)throw Error(`ALPACA_${page.toUpperCase()}_${feed}_${resp.status}`);
  const json=await resp.json();arr.push(...(json[page]||[]).map(x=>({...x,symbol})));token=json.next_page_token;if(!token)break;if(n===19)throw Error('ALPACA_PAGINATION_LIMIT');
 }
 return arr;
}
export async function acquireHistorical39({symbols,start,end,asOf=new Date().toISOString(),apiKey,secret,request=fetch}={}){
 if(!apiKey||!secret)throw Error('MISSING_ALPACA_KEYS');
 const a=Date.parse(start),b=Date.parse(end),cutoff=Date.parse(asOf)-DELAY_MS;
 if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b)throw Error('INVALID_RANGE');
 if(b>cutoff)throw Error('SIP_END_MUST_BE_AT_LEAST_16_MIN_OLD');
 const list=[...new Set((symbols||[]).map(x=>String(x).trim().toUpperCase()))].filter(s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));
 if(!list.length||list.length>10)throw Error('SYMBOL_LIMIT_1_TO_10');
 const payload={iexBars:{},sipBars:{},iexQuotes:{},sipQuotes:{}};
 for(const s of list){for(const [feed,name] of [['iex','iex'],['sip','sip']])for(const [type,kind] of [['bars','Bars'],['quotes','Quotes']]){
  payload[`${name}${kind}`][s]=await fetchHistory({symbol:s,start,end,feed,type,apiKey,secret,request});
 }}
 return payload;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [, ,mode,...args]=process.argv;
 try{
  if(mode==='compare'){
   if(args.length<3)throw Error('USAGE: compare input.json output.json asOfISO');
   const [input,output,asOf]=args;const report=compareFeeds39(JSON.parse(readFileSync(input,'utf8')),{asOf});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.recordCount,sipRescuesOpening:report.sipRescuesOpening,output}));
  }else if(mode==='fetch'){
   if(args.length<5)throw Error('USAGE: fetch SYMBOL1,SYMBOL2 startISO endISO output.json asOfISO');
   const [symbols,start,end,output,asOf]=args;
   // Explicit user-invoked local CLI only. Never scheduled, never part of live scanner.
   const data=await acquireHistorical39({symbols:symbols.split(','),start,end,asOf,apiKey:process.env.ALPACA_API_KEY_ID,secret:process.env.ALPACA_API_SECRET_KEY});writeFileSync(output,JSON.stringify(data,null,2));console.log(`SAVED ${output}`);
  }else throw Error('USAGE: compare | fetch');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
