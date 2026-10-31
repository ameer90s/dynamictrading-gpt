import assert from 'node:assert/strict';
import {archiveHealth} from '../netlify/functions/archive-health.mjs';
const db=new Map();const day='2026-10-30';for(const p of ['scanner-audit','ai-parallel-audit']){db.set(`${p}-${day}-0570`,{minute:570,storedAt:'2026-10-30T13:30:00Z',records:[]});db.set(`${p}-${day}-0571`,{minute:571,records:[{symbol:'TEST'}]});}
const store={async get(k){return db.get(k)||null}};
let r=await archiveHealth(new Request(`https://test/api/archive-health?day=${day}&until=571&minutes=2`),store);assert.equal(r.status,200);let j=await r.json();assert.equal(j.streams.scanner.zeroCandidateMinutes,1);assert.equal(j.streams.ai.records,1);
r=await archiveHealth(new Request(`https://test/api/archive-health?day=${day}&until=572&minutes=3`),store);assert.equal(r.status,200);j=await r.json();assert.deepEqual(j.streams.ai.missingMinutes,[572]);
r=await archiveHealth(new Request('https://test/api/archive-health?day=2026-10-29&until=570&minutes=1'),store);assert.equal(r.status,503);
console.log('PASS archive-health37: both streams, empty minute, missing minute, no archive health failure');
