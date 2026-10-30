const POSITIVE = [
  ["approval",14],["approved",14],["contract",12],["award",11],["partnership",10],["strategic",6],["raises guidance",15],["beats",12],["record revenue",10],["buyback",9],["launch",5],["expands",5],["milestone",7],["investment",6],["acquisition",5],["upgrade",10],["price target raised",9],["fda",10],["order",7],["backlog",7],["profit",6]
];
const NEGATIVE = [
  ["offering",-18],["dilution",-22],["shelf registration",-20],["investigation",-20],["subpoena",-18],["lawsuit",-14],["recall",-18],["bankruptcy",-30],["cuts guidance",-22],["misses",-14],["delay",-10],["resignation",-8],["going concern",-28],["downgrade",-10],["price target cut",-9],["secondary offering",-22],["atm offering",-22],["halt",-15],["delisting",-25]
];
const HIGH_RISK = ["offering","dilution","shelf registration","investigation","subpoena","lawsuit","recall","bankruptcy","going concern","secondary offering","atm offering","delisting"];

export async function fetchPressReleases(symbol, apiKey, outputsize=3) {
  const url=new URL("https://api.twelvedata.com/press_releases");
  url.searchParams.set("symbol",symbol);url.searchParams.set("language","en,en-US");url.searchParams.set("outputsize",String(Math.max(1,Math.min(10,outputsize))));url.searchParams.set("apikey",apiKey);
  const response=await fetch(url,{headers:{Accept:"application/json"}});const root=await response.json().catch(()=>({}));
  if(!response.ok||root.status==="error"||root.code) throw new Error(root.message||`HTTP ${response.status}`);
  return Array.isArray(root.press_releases)?root.press_releases:[];
}

function scoreText(text){
  const t=strip(text).toLowerCase();let sentiment=0;
  for(const [k,w] of POSITIVE)if(t.includes(k))sentiment+=w;
  for(const [k,w] of NEGATIVE)if(t.includes(k))sentiment+=w;
  const riskTerms=HIGH_RISK.filter(k=>t.includes(k));
  return {sentiment:Math.max(-100,Math.min(100,sentiment)),riskTerms};
}
function ageHours(v){const d=new Date(v||0);return Number.isFinite(d.getTime())?(Date.now()-d.getTime())/36e5:9999;}
function dedupe(items){const seen=new Set(),out=[];for(const x of items){const key=strip(x.title||x.headline||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,160);if(key&&seen.has(key))continue;if(key)seen.add(key);out.push(x);}return out;}

export function summarizeCompositeNews(symbol, releases=[], articles=[]) {
  const pr=(releases||[]).map(r=>{const s=scoreText(`${r.title||''} ${r.body||''}`);return {id:r.id||null,datetime:r.datetime||null,title:strip(r.title||''),summary:'',sentiment:s.sentiment,riskTerms:s.riskTerms,ageHours:ageHours(r.datetime),source:'Company press release',url:r.url||''};});
  const news=(articles||[]).filter(a=>!a.symbols?.length||a.symbols.includes(symbol)).map(a=>{const s=scoreText(`${a.headline||''} ${a.summary||''}`);return {id:a.id||null,datetime:a.created_at||a.updated_at||null,title:strip(a.headline||''),summary:strip(a.summary||''),sentiment:s.sentiment,riskTerms:s.riskTerms,ageHours:ageHours(a.created_at||a.updated_at),source:a.source||'Market news',url:a.url||''};});
  const recent=dedupe([...news,...pr]).filter(r=>r.ageHours<=96).sort((a,b)=>a.ageHours-b.ageHours);
  const weighted=recent.reduce((a,r)=>{const w=r.ageHours<=12?1.25:r.ageHours<=24?1:r.ageHours<=48?.65:.35;return {s:a.s+r.sentiment*w,w:a.w+w}}, {s:0,w:0});
  const sentimentScore=weighted.w?weighted.s/weighted.w:0;
  const recentRisk=recent.filter(r=>r.ageHours<=72&&r.riskTerms.length);
  const maxRisk=recentRisk.some(r=>r.ageHours<=24)?92:recentRisk.length?82:recent.length?20:0;
  const catalystScore=recent.length?Math.min(100,30+recent.filter(r=>Math.abs(r.sentiment)>=10).length*12+Math.min(25,Math.abs(sentimentScore))+Math.min(15,recent.length*2)):0;
  const sources=[...new Set(recent.map(r=>r.source))];
  return {symbol,status:recent.length?'ok':'empty',count:recent.length,sentimentScore:Math.round(sentimentScore),riskScore:maxRisk,catalystScore:Math.round(catalystScore),latest:recent.slice(0,5),source:sources.length?sources.join(' + '):'No fresh news',generatedAt:new Date().toISOString()};
}

export function summarizeNews(symbol, releases=[]) { return summarizeCompositeNews(symbol,releases,[]); }
export function emptyNews(symbol, reason="لا توجد أخبار حديثة") {return {symbol,status:"empty",count:0,sentimentScore:0,riskScore:0,catalystScore:0,latest:[],source:"No fresh news",note:reason,generatedAt:new Date().toISOString()};}
function strip(s){return String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,1200);}
