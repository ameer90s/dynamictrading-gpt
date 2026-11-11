/** Local behavioral test of production handler with an injected in-memory Blob adapter.
 * Not a live Netlify Blobs integration test.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const store=new Map();let writes=0;
const mocked={
 async get(key){return store.get(key)??null},
 async setJSON(key,value,opt={}){writes++;if(opt.onlyIfNew&&store.has(key))return {modified:false};store.set(key,structuredClone(value));return {modified:true}},
 async list({prefix}){return {blobs:[...store.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),cursor:null}}
};
globalThis.__DT38_TEST_GET_STORE=()=>mocked;
const source=readFileSync(new URL('../netlify/functions/research-decision38.mjs',import.meta.url),'utf8')
 .replace("import {getStore} from '@netlify/blobs';",'const getStore=globalThis.__DT38_TEST_GET_STORE;');
assert(!source.includes("from '@netlify/blobs'"));
const moduleUrl='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {default:handle}=await import(moduleUrl);
process.env.DT38_DECISION_ADMIN_TOKEN='A_LOCAL_32_CHARACTER_ADMIN_TEST_SECRET';
const token=process.env.DT38_DECISION_ADMIN_TOKEN;
const url='https://localhost/api/research-decision38';
const req=(method,body,secret=token)=>new Request(url+(method==='GET'?'?day=2026-11-10':''),{method,headers:{authorization:'Bearer '+secret,...(method==='POST'?{'content-type':'application/json'}:{})},body:method==='POST'?JSON.stringify(body):undefined});
const sample={id:'sample-1',day:'2026-11-10',source:'OPENAI',summary:'Test recommendation',verdict:'APPROVE'};
assert.equal((await handle(req('POST',sample,'incorrect'))).status,401);
assert.equal(writes,0);
let r=await handle(req('POST',sample));assert.equal(r.status,200);assert.equal((await r.json()).productionApplied,false);assert.equal(writes,1);
r=await handle(req('POST',{...sample,verdict:'REJECT'}));assert.equal((await r.json()).status,'ALREADY_RECORDED');assert.equal(writes,1);
r=await handle(req('GET'));assert.equal(r.status,200);let data=await r.json();assert.equal(data.decisions.length,1);assert.equal(data.decisions[0].verdict,'APPROVE');assert.equal(data.decisions[0].autoTrade,false);assert.equal(data.decisions[0].autoDeploy,false);
r=await handle(req('POST',{...sample,id:'not allowed!'}));assert.equal(r.status,400);
console.log('DT38_OWNER_DECISION_MOCK_PASS 6/6 (mock store; real Netlify Blobs NOT VERIFIED)');
