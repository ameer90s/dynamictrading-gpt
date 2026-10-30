export function alpacaConfigured(env=process.env){
  return Boolean(env.ALPACA_API_KEY_ID && env.ALPACA_API_SECRET_KEY);
}
function headers(key,secret){return {Accept:'application/json','APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret};}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function alpacaFetch(url,options={},maxRetries=3){let last;for(let attempt=0;attempt<=maxRetries;attempt++){const r=await fetch(url,options);if(r.status!==429&&r.status<500)return r;last=r;if(attempt<maxRetries){const retryAfter=Number(r.headers?.get?.('retry-after')||0);await sleep(retryAfter>0?Math.min(5000,retryAfter*1000):Math.min(3000,250*2**attempt));}}return last;}

export async function fetchLatestQuotes(symbols,key,secret){
  const list=[...new Set((symbols||[]).map(s=>String(s).trim().toUpperCase()).filter(Boolean))].slice(0,50);
  if(!list.length)return {};
  const url=new URL('https://data.alpaca.markets/v2/stocks/quotes/latest');
  url.searchParams.set('symbols',list.join(','));url.searchParams.set('feed','iex');
  const r=await alpacaFetch(url,{headers:headers(key,secret)});const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.message||`Alpaca quotes HTTP ${r.status}`);
  const out={};
  for(const s of list){const q=d.quotes?.[s];if(!q)continue;const bid=Number(q.bp),ask=Number(q.ap),bidSize=Number(q.bs||0),askSize=Number(q.as||0);const mid=(bid>0&&ask>0)?(bid+ask)/2:0;const spread=mid?Math.max(0,ask-bid):null;const spreadPct=mid&&spread!=null?spread/mid*100:null;out[s]={symbol:s,bid,ask,bidSize,askSize,mid,spread,spreadPct,spreadBps:spreadPct==null?null:spreadPct*100,timestamp:q.t||null,source:'Alpaca IEX latest quote'};}
  return out;
}
export async function fetchNews(symbols,key,secret,{hours=72,limit=50}={}){
  const list=[...new Set((symbols||[]).map(s=>String(s).trim().toUpperCase()).filter(Boolean))].slice(0,50);
  if(!list.length)return [];
  const start=new Date(Date.now()-hours*3600e3).toISOString();
  const url=new URL('https://data.alpaca.markets/v1beta1/news');
  url.searchParams.set('symbols',list.join(','));url.searchParams.set('start',start);url.searchParams.set('sort','desc');url.searchParams.set('limit',String(Math.min(50,Math.max(1,limit))));url.searchParams.set('include_content','false');
  const r=await alpacaFetch(url,{headers:headers(key,secret)});const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.message||`Alpaca news HTTP ${r.status}`);
  return (Array.isArray(d.news)?d.news:[]).map(n=>({id:n.id||null,headline:n.headline||'',summary:n.summary||'',author:n.author||'',source:n.source||'Benzinga',created_at:n.created_at||null,updated_at:n.updated_at||null,url:n.url||'',symbols:Array.isArray(n.symbols)?n.symbols:[]}));
}

function nyBarString(iso){
  const d=new Date(iso);const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:00`;
}

// Intraday 1-minute bars for the live recommendation engine. Alpaca IEX lets the
// app analyse up to eight recommendation symbols without colliding with the
// Twelve Data 8-credit/minute ceiling. The returned timestamps are normalized
// to New York time so the existing session logic can be reused unchanged.
export async function fetchIntradayBars(symbol,key,secret,{lookbackDays=12}={}){
  const end=new Date();
  const start=new Date(end.getTime()-Math.max(7,Math.min(20,Number(lookbackDays)||12))*86400e3);
  const out=[];let token=null;let guard=0;
  do{
    const url=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(String(symbol).toUpperCase())}/bars`);
    url.searchParams.set('timeframe','1Min');url.searchParams.set('start',start.toISOString());url.searchParams.set('end',end.toISOString());
    url.searchParams.set('adjustment','raw');url.searchParams.set('feed','iex');url.searchParams.set('sort','asc');url.searchParams.set('limit','10000');
    if(token)url.searchParams.set('page_token',token);
    const r=await alpacaFetch(url,{headers:headers(key,secret)});const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(`${symbol}: ${d.message||`Alpaca bars HTTP ${r.status}`}`);
    for(const b of (d.bars||[]))out.push({datetime:nyBarString(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v||0)});
    token=d.next_page_token||null;guard++;
  }while(token&&guard<4);
  const map=new Map();for(const x of out){if([x.open,x.high,x.low,x.close].every(Number.isFinite))map.set(x.datetime,x);}
  return [...map.values()].sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
}
