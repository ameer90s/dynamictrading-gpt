import assert from 'node:assert/strict';
import {updateShadowSix} from '../netlify/functions/lib/shadow36.mjs';
const target=()=>({mode:'blend',target:101,firstHitAt:null,stopFirstAt:null,postExitHitAt:null,status:'TRACKING',maxPrice:100,minPrice:100});
function signal(){return{entry:100,sl:99,closedAt:null,shadowTargets:{blend:target(),atr_4:{...target(),mode:'atr_4',target:103}}};}
let s=signal();assert.equal(updateShadowSix(s,{t:'10:00',h:101.2,l:99.5}),true);
assert.equal(s.shadowTargets.blend.status,'HIT_BEFORE_STOP');assert.equal(s.shadowTargets.atr_4.status,'TRACKING');
s=signal();updateShadowSix(s,{t:'10:01',h:100.5,l:98.8});assert.equal(s.shadowTargets.blend.status,'STOP_FIRST');
s.closedAt='10:01';updateShadowSix(s,{t:'10:02',h:101.5,l:100.1});assert.equal(s.shadowTargets.blend.postExitHitAt,'10:02');
s=signal();updateShadowSix(s,{t:'10:03',h:101.5,l:98.8});assert.equal(s.shadowTargets.blend.status,'AMBIGUOUS_SAME_BAR');
assert.equal(s.shadowTargets.blend.firstHitAt,null,'same-minute price ordering unknown');
s=signal();updateShadowSix(s,{t:'10:04',h:101.5,l:99.2});s.closedAt='10:04';updateShadowSix(s,{t:'10:05',h:103.2,l:101});
assert.equal(s.shadowTargets.atr_4.postExitHitAt,'10:05');
console.log('SHADOW36_PASS 8/8');
