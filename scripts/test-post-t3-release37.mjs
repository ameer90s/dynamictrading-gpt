import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';
import {trackPostT3Bar37} from '../netlify/functions/lib/post-t3-followup37.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function baseline() {
  return {symbol:'TEST',signalId:'test-1',entry:100,sl:90,t1:104,t2:108,t3:110,
    confirmedAt:'2026-11-06T14:00:00.000Z',active:true,followAfterT3:false,
    followAfterStop:false,hits:[],features:{},shadowTargets:{},recommendedTarget:'T3'};
}
const bar=(t,high,close,low=106)=>({t,o:107,h:high,l:low,c:close});

test('T3 crossing bar records intrabar high, timestamp and close giveback',()=>{
  const sig=baseline();sig.followAfterT3=true;sig.postT3Peak=sig.t3;sig.postT3PeakAt='2026-11-06T14:01:00.000Z';
  assert.equal(trackPostT3Bar37(sig,bar('2026-11-06T14:01:00.000Z',112,111)),true);
  assert.equal(sig.postT3Peak,112);
  assert.equal(sig.postT3MfePct,1.818);
  assert.equal(sig.postT3GivebackPct,.893);
});
test('unchanged peak with a new close updates giveback and triggers persistence',()=>{
  const sig={...baseline(),postT3Peak:112,postT3PeakAt:'2026-11-06T14:01:00.000Z',postT3MfePct:1.818,postT3GivebackPct:.893};
  assert.equal(trackPostT3Bar37(sig,bar('2026-11-06T14:02:00.000Z',111,109)),true);
  assert.equal(sig.postT3Peak,112);
  assert.equal(sig.postT3PeakAt,'2026-11-06T14:01:00.000Z');
  assert.equal(sig.postT3GivebackPct,2.679);
  assert.equal(trackPostT3Bar37(sig,bar('2026-11-06T14:02:00.000Z',111,109)),false);
});
test('research followup does not mutate entry, targets, stop or confirmedAt',()=>{
  const sig={...baseline(),postT3Peak:110};const original={...sig};
  trackPostT3Bar37(sig,bar('2026-11-06T14:01:00.000Z',115,113));
  for(const x of ['entry','sl','t1','t2','t3','confirmedAt','signalId'])assert.equal(sig[x],original[x]);
});
test('bad/missing candles are not treated as observed followups',()=>{
  const sig={...baseline()};
  assert.equal(trackPostT3Bar37(sig,bar('2026-11-06T14:01:00.000Z',NaN,109)),false);
  assert.equal(trackPostT3Bar37(sig,bar('2026-11-06T14:01:00.000Z',110,NaN)),false);
  assert.equal(sig.postT3Peak,undefined);
});

async function makeHarness(initialSignals,bars,minute=650) {
  const trackerPath=resolve(root,'netlify/functions/outcome-tracker.mjs');
  let source=readFileSync(trackerPath,'utf8');
  const repl=[
    [/import \{ getStore \} from '@netlify\/blobs';/,`const getStore=()=>globalThis.__tp3Tracker.store;`],
    [/import \{ recommendationWindow \} from '\.\/lib\/time\.mjs';/,`const recommendationWindow=()=>globalThis.__tp3Tracker.clock;`],
    [/import \{sessionPlan37\} from '\.\/lib\/trading-session-plan37\.mjs';/,`const sessionPlan37=()=>globalThis.__tp3Tracker.plan;`],
    [/import \{ alpacaConfigured \} from '\.\/lib\/alpaca\.mjs';/,`const alpacaConfigured=()=>true;`],
    [/import \{ refreshScannerLearning \} from '\.\/lib\/learning\.mjs';/,`const refreshScannerLearning=async()=>{globalThis.__tp3Tracker.learnCalls++};`],
    [/import \{updateShadowSix\} from '\.\/lib\/shadow36\.mjs';/,`const updateShadowSix=()=>false;`],
    [/import \{earliestOutcomeWindowBySymbol37\} from '\.\/lib\/outcome-fetch-plan37\.mjs';/,`const earliestOutcomeWindowBySymbol37=()=>new Map([['TEST','2026-11-06T14:00:00.000Z']]);`],
    [/import \{trackPostT3Bar37\} from '\.\/lib\/post-t3-followup37\.mjs';/,`import {trackPostT3Bar37} from '${pathToFileURL(resolve(root,'netlify/functions/lib/post-t3-followup37.mjs')).href}';`]
  ];
  for(const [pattern,sub] of repl){assert.match(source,pattern);source=source.replace(pattern,sub);}
  const obj={signals:{TEST:{symbol:'TEST',confirmedSignals:initialSignals}},events:[]};
  const recorded=[];
  const store={get:async()=>obj,setJSON:async(key,v)=>{recorded.push(key)}};
  globalThis.__tp3Tracker={store,clock:{isTradingDay:true,minuteOfDay:minute,dateKey:'2026-11-06'},plan:{discovery:minute<900,followupDue:true,close:960},learnCalls:0};
  globalThis.fetch=async()=>({ok:true,json:async()=>({bars:bars.map(b=>({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c}))})});
  const handler=(await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source))).default;
  return {handler,obj,recorded};
}

test('handler commits on same-minute TP3 overshoot and preserves immutable targets',async()=>{
  const sig=baseline();
  const {handler,obj,recorded}=await makeHarness([sig],[bar('2026-11-06T14:01:00.000Z',112,111)]);
  const response=await handler();
  assert.equal(await response.text(),'Outcomes updated');
  assert.equal(sig.finalOutcome,'T3');
  assert.equal(sig.postT3Peak,112);assert.equal(sig.postT3GivebackPct,.893);
  assert.equal(sig.entry,100);assert.equal(sig.t3,110);assert.equal(sig.sl,90);
  assert.deepEqual(recorded,['signal-history-2026-11-06','signal-history-latest']);
  assert.equal(globalThis.__tp3Tracker.learnCalls,1);
  assert.ok(obj.events.some(e=>e.event==='T3'));
});
test('handler saves changed giveback even with unchanged peak',async()=>{
  const sig={...baseline(),active:false,followAfterT3:true,hits:['T1','T2','T3'],
    finalOutcome:'T3',postT3Peak:112,postT3PeakAt:'2026-11-06T14:01:00.000Z',postT3MfePct:1.818,postT3GivebackPct:.893,
    lastBarAt:'2026-11-06T14:01:00.000Z'};
  const {handler,recorded}=await makeHarness([sig],[bar('2026-11-06T14:02:00.000Z',111,109)]);
  assert.equal(await (await handler()).text(),'Outcomes updated');
  assert.equal(sig.postT3Peak,112);assert.equal(sig.postT3GivebackPct,2.679);
  assert.equal(recorded.length,2);
  // Replaying the same completed bar must not write the same result again.
  assert.equal(await (await handler()).text(),'No changes');
  assert.equal(recorded.length,2);
});
test('handler persists follow-up retirement at session close even without fresh bars',async()=>{
  const sig={...baseline(),active:false,followAfterT3:true,hits:['T3'],finalOutcome:'T3',lastBarAt:'2026-11-06T14:02:00.000Z'};
  const {handler,recorded}=await makeHarness([sig],[],960);
  assert.equal(await (await handler()).text(),'Outcomes updated');
  assert.equal(sig.followAfterT3,false);
  assert.equal(recorded.length,2);
});
test('handler never infers target before confirmed timestamp',async()=>{
  const sig=baseline();
  const {handler,recorded}=await makeHarness([sig],[bar('2026-11-06T14:00:00.000Z',120,111)]);
  assert.equal(await (await handler()).text(),'No changes');
  assert.equal(recorded.length,0);
  assert.equal(sig.finalOutcome,undefined);
});
