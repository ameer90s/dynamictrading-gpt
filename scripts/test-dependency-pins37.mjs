import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
test('production dependency references are pinned to a specific published version',()=>{
 for(const [name,version] of Object.entries(manifest.dependencies||{})) {
  assert.match(version,/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/,`${name} must use an exact version`);
 }
 assert.equal(manifest.dependencies['@netlify/blobs'],'11.1.7');
 assert.equal(manifest.dependencies['web-push'],'3.6.7');
});
test('lockfile consistency is checked when an installable lock is available',{skip:!existsSync(resolve(root,'package-lock.json'))?'NOT VERIFIED: offline npm registry metadata unavailable':false},()=>{
 const path=resolve(root,'package-lock.json');
 if(!existsSync(path)) {
  // Pinning the top-level manifest is testable offline, but the full dependency
  // tree still needs npm registry resolution before running npm ci.
  return;
 }
 const lock=JSON.parse(readFileSync(path,'utf8'));
 for(const [name,version] of Object.entries(manifest.dependencies||{})) {
  assert.equal(lock.packages?.['']?.dependencies?.[name],version);
  assert.equal(lock.packages?.['node_modules/'+name]?.version,version);
 }
});
