// Read-only environment diagnostic. Never contacts Netlify, reads site data, or deploys.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
const root = resolve(import.meta.dirname,'..');
const req=createRequire(import.meta.url);
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
const check={
  timestamp:new Date().toISOString(),
  mode:'LOCAL_PRECHECK_NO_NETLIFY_CALLS',
  declaredSdk:pkg.dependencies?.['@netlify/blobs']||null,
  lockedSdk:lock.packages?.['node_modules/@netlify/blobs']?.version||null,
  nodeVersion:process.version,
  nodeCompatible:Number(process.versions.node.split('.')[0])>=22,
  sdkResolvable:false,
  netlifyCliResolvable:false,
  siteIdProvided:!!process.env.NETLIFY_SITE_ID,
  tokenProvided:!!(process.env.NETLIFY_AUTH_TOKEN||process.env.NETLIFY_TOKEN),
  npmDnsReachable:false,
  liveBlobsVerified:false,
  deployTriggered:false,
};
try {req.resolve('@netlify/blobs');check.sdkResolvable=true;}catch{}
try {req.resolve('netlify-cli');check.netlifyCliResolvable=true;}catch{}
try {await Promise.race([lookup('registry.npmjs.org').then(()=>check.npmDnsReachable=true),new Promise((_,rej)=>setTimeout(()=>rej(new Error('DNS_TIMEOUT')),2500))]);}catch{}
const blockers=[];
if(!check.sdkResolvable)blockers.push('SDK_NOT_INSTALLED');
if(!check.npmDnsReachable)blockers.push('NPM_DNS_UNAVAILABLE');
if(!check.siteIdProvided)blockers.push('SITE_ID_NOT_AVAILABLE_HERE');
if(!check.tokenProvided)blockers.push('NETLIFY_TOKEN_NOT_AVAILABLE_HERE');
check.blockers=blockers;
check.status=blockers.length?'LIVE_INTEGRATION_NOT_VERIFIED':'READY_FOR_SEPARATELY_AUTHORIZED_READ_ONLY_TEST';
console.log(JSON.stringify(check,null,2));
