import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const toml = readFileSync('netlify.toml','utf8');
assert.doesNotMatch(toml, /\[\[redirects\]\][\s\S]*?from\s*=\s*["']\/api\/\*["']/);
assert.doesNotMatch(toml, /to\s*=\s*["']\/\.netlify\/functions\/:splat["']/);
assert.match(toml,/publish\s*=\s*["']public["']/);
assert.match(toml,/functions\s*=\s*["']netlify\/functions["']/);

const services = new Map();
for(const name of readdirSync('netlify/functions').filter(x=>x.endsWith('.mjs'))){
 const code=readFileSync(join('netlify/functions',name),'utf8');
 const paths=[...code.matchAll(/export\s+const\s+config\s*=\s*\{\s*path\s*:\s*["'](\/api\/[^"']+)["']/g)].map(m=>m[1]);
 for(const p of paths){
  assert(!services.has(p),`Duplicate function path ${p}`);
  services.set(p,name);
 }
}
for(const p of ['/api/latest','/api/market','/api/selection','/api/push-subscribe','/api/market-clock','/api/ai-parallel','/api/archive-health','/api/transition-cards','/api/ai-insights']){
 assert(services.has(p),`Missing mapped Netlify Function ${p}`);
}
const sourceFiles=['app.js','dt37-cockpit.js','ai-parallel-panel.js'];
for(const name of sourceFiles){
 const code=readFileSync(join('public',name),'utf8');
 for(const m of code.matchAll(/['"`]\s*(\/api\/[a-z][a-z0-9-]*)/g)){
  assert(services.has(m[1]),`Client ${name} calls unconfigured API ${m[1]}`);
 }
}
assert.match(readFileSync('netlify/functions/research-status37.mjs','utf8'),/export\s+default/);
const scheduler=['daily-recommendation','news-scan','outcome-tracker','premarket-memory','ai-parallel-scan'];
for(const name of scheduler){assert.match(toml, new RegExp('\\[functions\\."'+name+'"\\]'),`Missing scheduled job ${name}`)}
assert.match(readFileSync('netlify/functions/research-openai37.mjs','utf8'),/schedule\s*:\s*['"]15 22 \* \* 1-5['"]/);
console.log(`PASS Netlify routing: ${services.size} explicit /api/ endpoints, no conflicting rewrite, schedules preserved.`);