import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
import {memoryStore372} from './lib/memory-store372.mjs';
import {preserveRetiredBooks372,retiredArchiveKey372} from '../netlify/functions/lib/retired-paper-archive372.mjs';
test('retirement archives embedded and independent books verbatim, including OPEN unsettled positions',async()=>{
 const day='2026-11-10',book={records:{A:{position:{id:'old1',status:'OPEN'}}},closedOutcomes:[{id:'old2',status:'CLOSED',netUsd:-3}]};
 const standalone={day,book};const store=memoryStore372({[`dt37-standalone-scalp-state-${day}`]:standalone});
 const before={dateKey:day,records:{BASE:{symbol:'BASE'}},scalp37:book};
 const migrated=await preserveRetiredBooks372(store,day,before);
 assert.deepEqual(store.map.get(retiredArchiveKey372(day)).data.embedded,book);
 assert.deepEqual(store.map.get(retiredArchiveKey372(day)).data.standalone,standalone);
 assert.equal(migrated.scalp37,undefined);assert.deepEqual(migrated.records,before.records);
 assert.equal(migrated.retiredArchive372.status,'ARCHIVED_READ_ONLY_UNSETTLED_POSITIONS_NOT_REALIZED');
 assert.deepEqual(await preserveRetiredBooks372(store,day,migrated),migrated);
});
test('archive readback outage blocks retirement; a changed legacy book is never overwritten',async()=>{
 const day='2026-11-10',state={scalp37:{records:{A:{position:{status:'OPEN'}}}}},store=memoryStore372();
 await preserveRetiredBooks372(store,day,state);
 await assert.rejects(preserveRetiredBooks372(store,day,{scalp37:{records:{B:{position:{status:'OPEN'}}}}}),/RETIRED_BOOK_CONFLICT/);
 assert(store.map.get(retiredArchiveKey372(day)).data.embedded.records.A);
});
test('retired engines and their schedules/UI are absent; historical archive route remains read-only',()=>{
 for(const n of ['ai-scalp-paper37','scalp-standalone37','scalp-features37','scalp-pattern-engine37','scalp-agent-review37'])
  assert.equal(existsSync(new URL('../netlify/functions/lib/'+n+'.mjs',import.meta.url)),false,n);
 for(const p of ['netlify/functions/scalp-paper37.mjs','netlify/functions/scalp-paper-scan37.mjs','public/dt37-scalp-panel37.js'])assert.equal(existsSync(p),false);
 assert(!readFileSync('netlify.toml','utf8').includes('[functions."scalp-paper-scan37"]'));
 const endpoint=readFileSync('netlify/functions/retired-paper-archive372.mjs','utf8');
 assert(endpoint.includes("request.method!=='GET'"));assert(!endpoint.includes('setJSON('));
});
