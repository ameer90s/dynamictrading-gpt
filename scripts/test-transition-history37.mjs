import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateSignalHistory} from '../netlify/functions/lib/signal-history.mjs';
const day='2026-11-03';const m=new Map();const store={get:async k=>m.get(k)||null,setJSON:async(k,v)=>{m.set(k,structuredClone(v))}};
const row=(symbol,state='WAIT')=>({symbol,recommendationState:state,price:15,entryLow:14.8,entryHigh:15.2,target1:15.5,target2:15.7,target3:15.9,stopLoss:14.4});
let n=0;async function check(name,fn){await fn();n++;console.log('PASS',name)}
await check('all candidates preserved when display8 empty',async()=>{await updateSignalHistory(store,{all:[row('AAA'),row('BBB')],display8:[],generatedAt:'2026-11-03T16:00:00Z'},day);assert.deepEqual(Object.keys(m.get(`signal-history-${day}`).signals).sort(),['AAA','BBB'])});
await check('display8 does not mask other candidates in all',async()=>{await updateSignalHistory(store,{all:[row('AAA'),row('BBB'),row('CCC')],display8:[row('AAA','SMART')],generatedAt:'2026-11-03T16:01:00Z'},day);const s=m.get(`signal-history-${day}`).signals;assert.deepEqual(Object.keys(s).sort(),['AAA','BBB','CCC']);assert.equal(s.AAA.lastState,'SMART')});
await check('incomplete display row cannot mask full state',async()=>{await updateSignalHistory(store,{all:[row('DDD','WAIT')],display8:[{symbol:'DDD'}],generatedAt:'2026-11-03T16:02:00Z'},day);assert.equal(m.get(`signal-history-${day}`).signals.DDD.lastState,'WAIT')});
await check('each symbol processed only once per update',async()=>{const s=m.get(`signal-history-${day}`).signals;assert.equal(s.AAA.transitions.filter(x=>x.at==='2026-11-03T16:01:00Z').length,1)});
await check('history transitions tagged current version',async()=>{const s=m.get(`signal-history-${day}`).signals;assert.equal(s.AAA.transitions.at(-1).version,'3.7')});
const code=readFileSync('netlify/functions/transition-cards.mjs','utf8').replace(/^import .*?;\s*$/gm,'').replace('export default async(req)=>{','const handler=async(req)=>{').replace('export const config','const config');
const handler=new Function('getStore','recommendationWindow','STRATEGY_VERSION','Response',code+'\nreturn handler;')(()=>({get:async()=>({signals:{AAA:{symbol:'AAA',transitions:[{at:'2026-11-03T16:00:00Z',version:'3.7',state:'SMART'}]},BBB:{symbol:'BBB',transitions:[{at:'2026-11-03T16:00:00Z',version:'3.6',state:'CONFIRMED'}]},CCC:{symbol:'CCC',transitions:[{at:'2026-11-03T16:00:00Z',version:'3.5',state:'SMART'}]}}})}),()=>({dateKey:day}),'3.7',Response);
await check('transitions show 3.7 and 3.6, not obsolete 3.5',async()=>{const r=await handler({method:'GET'}),j=await r.json();assert.equal(j.version,'3.7');assert.equal(j.total,2);assert.deepEqual(j.cards.map(x=>x.symbol).sort(),['AAA','BBB'])});
console.log('DT37_TRANSITION_HISTORY_PASS',n+'/'+n);
