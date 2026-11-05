/** Offline CLI: selected-symbol historical signal replay; no network or brokers. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {replayThreeScanners37} from '../netlify/functions/lib/research-historical-replay37.mjs';
import {runThreeEngineWalkForward37,runResearchReplayBatch37} from '../netlify/functions/lib/research-experiment-batch37.mjs';
const {values}=parseArgs({options:{fixture:{type:'string'},proposal:{type:'string'},period:{type:'string'},folds:{type:'string'},
  output:{type:'string'},trainingEnd:{type:'string'},holdoutStart:{type:'string'},holdoutEnd:{type:'string'},
  stride:{type:'string',default:'5'},sharia:{type:'string'},help:{type:'boolean',default:false}}});
if(values.help){console.log('OFFLINE ONLY --fixture archive.json.gz --proposal frozen.json --trainingEnd YYYY-MM-DD --holdoutStart YYYY-MM-DD --holdoutEnd YYYY-MM-DD --sharia csv [--stride 1] [--output report.json]\nOR --period period-report.json --holdoutStart ... --holdoutEnd ...\nOR --proposal frozen.json --folds folds.json');process.exit(0);}
if(!values.fixture||(!values.proposal&&!values.period))throw Error('OFFLINE_FIXTURE_AND_PROPOSAL_OR_PERIOD_REQUIRED');
const read=(p)=>{const b=readFileSync(p);return JSON.parse((p.endsWith('.gz')?gunzipSync(b):b).toString('utf8'));};
const fixture=read(values.fixture),proposal=values.proposal?read(values.proposal):null;
const approvedSymbols=values.sharia?readFileSync(values.sharia,'utf8').trim().split(/\r?\n/).slice(1).map(x=>x.split(',')[0]):[];
const everyMinutes=Number(values.stride);
const result=values.period?runResearchReplayBatch37({period:read(values.period),fixture,
  holdoutStart:values.holdoutStart,holdoutEnd:values.holdoutEnd,approvedSymbols,everyMinutes}):
 values.folds?runThreeEngineWalkForward37({fixture,proposal,folds:read(values.folds),approvedSymbols,everyMinutes}):
 replayThreeScanners37({fixture,proposal,trainingEnd:values.trainingEnd,
  holdoutStart:values.holdoutStart,holdoutEnd:values.holdoutEnd,approvedSymbols,everyMinutes});
const body=JSON.stringify(result,null,2);
if(values.output){writeFileSync(values.output,body+'\n');console.log(JSON.stringify({output:values.output,status:result.status||result.operationalStatus,
 reportId:result.runId||result.digest,proof:'OFFLINE_SIGNALS_ONLY_NO_MARKET_PNL'},null,2));}
else console.log(body);
