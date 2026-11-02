// Independent release-contract tests for Dynamic Trading 3.7.
// These tests deliberately FAIL if historical defects remain.
// They are not a claim that live Netlify data has been verified.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('Transitions API must not discard current strategy version 3.7',()=>{
  const v=read('netlify/functions/lib/version.mjs');
  const cards=read('netlify/functions/transition-cards.mjs');
  assert.match(v,/STRATEGY_VERSION\s*=\s*['"]3\.7['"]/);
  assert.doesNotMatch(cards,/x\.version\s*!==\s*['"]3\.6['"]/,
    'Critical: the transitions endpoint drops all current-version 3.7 events');
  assert.match(cards,/STRATEGY_VERSION|supportedVersions|SUPPORTED_VERSIONS|versionSet/,
    'Use shared or explicitly supported version list rather than a stale hardcoded version');
});

test('All scanner decisions must be eligible for state-history ingestion, even if display8 is empty',()=>{
  const src=read('netlify/functions/lib/signal-history.mjs');
  assert.doesNotMatch(src,/data\.display8\s*\|\|\s*data\.all/,
    'Critical: an empty display8 is truthy and masks the full data.all list');
  assert.match(src,/data\.all|allDecisionRows|decisionRows/,
    'Use full decision data to persist transitions; UI shortlist must not control audit completeness');
});

test('Market Pro missing optional Twelve Data key must not crash the whole screen',()=>{
  const src=read('netlify/functions/market-pro.mjs');
  assert.doesNotMatch(src,/if\s*\(\s*!apiKey\s*\)\s*return\s+json\(\s*\{\s*error\s*:\s*['"`][^\n]*TWELVE_DATA_API_KEY/,
    'If the optional provider is absent, use verified existing provider or explicit disabled state; no generic 500');
});

test('Research panel must distinguish in-session collection from waiting for the next session',()=>{
  const ui=read('public/dt37-research-panel.js');
  assert.match(ui,/جمع بيانات الجلسة|بانتظار مراجعة ما بعد الإغلاق|COLLECTING_SESSION/,
    'NO_REVIEW during an active session must not be shown as waiting for a session');
});

test('Netlify scheduled scan and parallel AI remain separately scheduled',()=>{
  const toml=read('netlify.toml');
  for(const name of ['daily-recommendation','ai-parallel-scan','outcome-tracker'])
    assert.ok(toml.includes('[functions."'+name+'"]'), 'missing '+name);
});

test('No wildcard API rewrite that breaks explicit Netlify function paths',()=>{
  const toml=read('netlify.toml');
  assert.doesNotMatch(toml,/from\s*=\s*["']\/api\/\*["']/);
});

test('No automatic brokerage orders in the independent AI paper engine',()=>{
  const src=read('netlify/functions/lib/ai-parallel36.mjs');
  assert.match(src,/NO_AUTO_BROKER_ORDERS/);
});

test('Release tests must not write changes to main or deploy to Netlify',()=>{
  const workflow=read('.github/workflows/independent-audit.yml');
  assert.doesNotMatch(workflow,/netlify\s+deploy|netlify\/actions|deploy-site|git\s+push\s+origin\s+main/i);
});
