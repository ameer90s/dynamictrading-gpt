import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync(new URL('../public/dt37-api-json.js',import.meta.url),'utf8');
const ctx={window:{},location:{origin:'https://example.netlify.app'},URL};vm.runInNewContext(js,ctx);
const test=(body,contentType='application/json',status=200,url='https://example.netlify.app/api/latest')=>({status,url,headers:{get:(k)=>k==='content-type'?contentType:null},text:async()=>body});
assert.deepEqual(JSON.parse(JSON.stringify(await ctx.window.DT37ApiJson.parse(test('{"valid":true}')))),{valid:true});
await assert.rejects(()=>ctx.window.DT37ApiJson.parse(test('<!doctype html><html>not found</html>','text/html',200)),/API_HTML_RESPONSE.*\/api\/latest.*HTTP 200/);
await assert.rejects(()=>ctx.window.DT37ApiJson.parse(test('<html>not found</html>','text/html',404)),/API_HTML_RESPONSE.*HTTP 404/);
await assert.rejects(()=>ctx.window.DT37ApiJson.parse(test('broken','application/json',200)),/API_INVALID_JSON/);
await assert.rejects(()=>ctx.window.DT37ApiJson.parse(test('not json','text/plain',503)),/API_NOT_JSON/);
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.includes('/dt37-api-json.js?v=3752'));
const jsSources=['app.js','dt37-cockpit.js','dt37-research-panel.js','ai-parallel-panel.js'];
for(const src of jsSources){const code=fs.readFileSync(new URL('../public/'+src,import.meta.url),'utf8');assert(code.includes('DT37ApiJson.parse')||code.includes('readJsonResponse'));assert(!/await (?:r|res|response|tr|ar)\.json\(\)/.test(code),src)}
console.log('DT37_API_JSON_SAFETY_PASS 9/9');
