/** Runs the full test suite offline without pretending to provide a real Netlify SDK.
 * Import-only guards throw on any getStore/getDeployStore/web-push call.
 * Keep production `npm test` and dependency lockfile unchanged.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const loader=fileURLToPath(new URL('./loader.mjs',import.meta.url));
const npmCLI=process.env.npm_execpath || '/usr/local/lib/node_modules/npm/bin/npm-cli.js';
assert(existsSync(loader)&&existsSync(npmCLI),'OFFLINE_TEST_BOOTSTRAP_MISSING');
const oldOpts=process.env.NODE_OPTIONS||'';
const env={...process.env,DT_OFFLINE_TEST_ONLY:'1',NODE_OPTIONS:`${oldOpts} --no-warnings --experimental-loader=${loader}`.trim()};
console.log('OFFLINE_TEST_MODE: import-only fail-closed adapters; REAL NETLIFY BLOBS/PUSH NOT VERIFIED');
const result=spawnSync(process.execPath,[npmCLI,'test'],{cwd:root,env,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
