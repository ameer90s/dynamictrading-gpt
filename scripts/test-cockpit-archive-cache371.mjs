import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../public/dt37-cockpit.js',import.meta.url),'utf8');
const buttons=new Map(),elements=new Map();
const get=id=>{if(!elements.has(id)){
 const obj={textContent:'',listeners:{},addEventListener(type,cb){this.listeners[type]=cb}};
 elements.set(id,obj);
 }return elements.get(id)};
const document={hidden:false,readyState:'complete',getElementById:get,querySelectorAll:()=>[],querySelector:()=>null};
let now=100000, archive=0, ai=0, cycle=null, failNext=false;
const fakeDate=class extends Date{static now(){return now}};
const window={DT37ApiJson:{parse:async response=>response.json()}};
const fetch=async url=>{
 if(url==='/api/archive-health'){
  archive++;
  if(failNext){failNext=false;return {ok:false,status:503,json:async()=>({})}}
  return {ok:true,status:200,json:async()=>({streams:{scanner:{foundMinutes:330,readErrors:0}},window:{minutes:330},dateKey:'2026-11-06'})};
 }
 if(url==='/api/ai-parallel?sessions=1'){
  ai++;
  return {ok:true,status:200,json:async()=>({latest:{at:'2026-11-06T15:00:00Z',coverage:{coveragePct:100}},days:[{aiPositions:[]}]})};
 }
 throw Error('Unexpected route: '+url)
};
const context={document,window,location:{search:''},Date:fakeDate,fetch,
 URLSearchParams,AbortController,setTimeout:()=>1,clearTimeout:()=>{},
 setInterval:cb=>{cycle=cb},console};
vm.runInNewContext(js,context,{filename:'dt37-cockpit.js'});
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve))};
const tick=async (offset=30_000)=>{now+=offset;cycle();await settle()};
await settle();
assert.equal(archive,1,'initial view verifies archive');
assert.equal(ai,1,'initial view reads AI');
assert.match(get('dt37ScannerDetail').textContent,/330 دقيقة مسجلة/);
for(let i=0;i<9;i++)await tick();
assert.equal(archive,1,'no repeated 660-Blob reads in the first 4.5 minutes');
assert.equal(ai,10,'AI cockpit still refreshed every 30 seconds');
await tick();
assert.equal(archive,2,'archive health rechecked at five-minute mark');
assert.equal(ai,11);
get('dt37CockpitRefresh').listeners.click();await settle();
assert.equal(archive,3,'manual refresh always forces an immediate audit');
assert.equal(ai,12,'manual refresh also updates AI');
failNext=true;await tick(5*60_000);
assert.equal(archive,4,'after expiry it retries against current evidence');
assert.match(get('dt37ScannerDetail').textContent,/تعذر قراءة/);
await tick(30_000);
assert.equal(archive,5,'a failed request is never cached as success');
assert.match(get('dt37ScannerDetail').textContent,/330 دقيقة مسجلة/);
assert.match(get('dt37ArchiveMinutes').textContent,/330 \/ 330/);
console.log('DT371_COCKPIT_ARCHIVE_CACHE_PASS: cache TTL, fresh AI, manual refresh, failed-read safety');
