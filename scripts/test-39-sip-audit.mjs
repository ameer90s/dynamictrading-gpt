import assert from 'node:assert/strict';
import {compareFeeds39,acquireHistorical39} from './sip-audit39.mjs';
const time=(minute,day='2026-11-12')=>`${day}T${String(14+Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:00Z`; // Nov EST: 14:30Z = 09:30 NY
const bar=(n,s='ABC')=>({symbol:s,t:time(n),o:10,h:11,l:9,c:10,v:100});
const quotes=(n)=>({symbol:'ABC',t:time(n),bp:10,ap:10.01,bs:3,as:4});
const asOf='2026-11-12T16:00:00Z';
const ix=[...Array(15).keys()].filter(n=>![3,4,5].includes(n)).map(n=>bar(n+30));
const sp=[...Array(15).keys()].map(n=>bar(n+30));
const cmp=compareFeeds39({iexBars:ix,sipBars:sp,iexQuotes:[quotes(30)],sipQuotes:[quotes(30)],scannerAudit:[{symbol:'ABC',date:'2026-11-12',reason:'INCOMPLETE_OPENING'}]},{asOf});
assert.equal(cmp.sipRescuesOpening,1);assert.deepEqual(cmp.rows[0].missingInIexFoundInSip,['09:33','09:34','09:35']);assert.equal(cmp.rows[0].scannerReasons[0],'INCOMPLETE_OPENING');assert.equal(cmp.rows[0].iexOpeningGatePass,false);assert.equal(cmp.rows[0].sipOpeningGatePass,true);console.log('PASS SIP restores exactly the research36 13-bars plus 09:30/09:44 opening gate');
assert.equal(cmp.neverLiveDecision,true);assert.equal(cmp.confirmedImpact,'NOT_VERIFIED');console.log('PASS audit cannot authorize live decisions');
assert.throws(()=>compareFeeds39({iexBars:ix,sipBars:[bar(30,'ABC')]},{asOf:'2026-11-12T14:40:00Z'}),/SIP_TOO_RECENT/);console.log('PASS historical age blocks recent SIP observations');
assert.equal(compareFeeds39({iexBars:ix,sipBars:sp},{asOf}).rows[0].iexComplete,false);console.log('PASS opening incompleteness detected');
const req=[];const fake=async(u)=>{req.push(u);return{ok:true,json:async()=>({[u.pathname.endsWith('bars')?'bars':'quotes']:[]})}};
const fetched=await acquireHistorical39({symbols:['ABC'],start:'2026-11-12T14:30:00Z',end:'2026-11-12T14:45:00Z',asOf,apiKey:'mock',secret:'mock',request:fake});
assert.equal(req.length,4);assert.deepEqual(req.map(u=>u.searchParams.get('feed')),['iex','iex','sip','sip']);assert.equal(fetched.sipQuotes.ABC.length,0);console.log('PASS both feeds and both bar/quote endpoints are queried only in explicit historical mode');
await assert.rejects(acquireHistorical39({symbols:['ABC'],start:'2026-11-12T14:30:00Z',end:'2026-11-12T15:59:00Z',asOf,apiKey:'mock',secret:'mock',request:fake}),/16_MIN/);assert.equal(req.length,4);console.log('PASS unavailable recent SIP never queried');
await assert.rejects(acquireHistorical39({symbols:['ABC'],start:'2026-11-12T14:30:00Z',end:'2026-11-12T14:45:00Z',asOf,request:fake}),/MISSING_ALPACA_KEYS/);console.log('PASS absent keys fail closed');
console.log('SIP_AUDIT_39_PASS 7/7');
