import fs from 'node:fs';import zlib from 'node:zlib';import {inspectResearchCandidates36} from '../netlify/functions/lib/research-live36.mjs';
const o=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const asBars=(a,d,t)=>a.filter(x=>x[0]<=t).map(x=>({datetime:`${d} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
const all=[],misses=[],cache=new Map();
for(const r of o.events){
 const label=`${r.date}|${r.symbol}|${r.validation_minute}`,a=o.bars[`${r.date}|${r.symbol}`];
 if(!cache.has(label))cache.set(label,inspectResearchCandidates36(asBars(a,r.date,r.validation_minute),new Date('2026-10-29T14:45:00Z'),{allowHistorical:true}));
 const got=cache.get(label);const matched=got.found.some(x=>x.minute===r.validation_minute&&x.retestModel===r.retest_model);
 all.push({date:r.date,symbol:r.symbol,validation_minute:r.validation_minute,model:r.retest_model,late:r.validation_minute>630,matched});
 if(!matched&&r.validation_minute>630)misses.push({...all.at(-1),found:got.found.map(x=>[x.minute,x.retestModel]),discovery:got.discovery});
}
const late=all.filter(x=>x.late),report={allCandidates:all.length,lateCandidates:late.length,lateMatching:late.filter(x=>x.matched).length,
 lateMissed:late.filter(x=>!x.matched).length,earlyResearchExcluded:all.length-late.length,allMatchCount:all.filter(x=>x.matched).length,misses:misses.slice(0,30)};
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,misses:report.misses.slice(0,4)},null,2));
if(report.lateMissed>0)process.exitCode=1;
