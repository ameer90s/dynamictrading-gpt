/** Standalone scalp paper scheduler. Extra invocations cost Netlify credits;
 * do not deploy before independent QA and explicit cost approval.
 */
import {getStore} from '@netlify/blobs';
import {runStandaloneScalp37} from './lib/scalp-standalone37.mjs';
export default async()=>{
 try{
  const r=await runStandaloneScalp37({store:getStore('dynamic-trading'),
   env:{...process.env,DT37_SCALP_STANDALONE_ENABLED:process.env.DT37_SCALP_STANDALONE_ENABLED??'true',
    DT37_AI_SCALP_PAPER_ENABLED:'false'}});
  return new Response(r.status,{status:r.status==='FAILED'?503:200});
 }catch(e){
  console.error('DT37_SCALP_STANDALONE_ERROR',String(e?.message||'unknown').slice(0,140));
  return new Response('SCALP_STANDALONE_FAILED_CLOSED',{status:503});
 }
};
