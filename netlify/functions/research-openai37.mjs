/** One post-close, opt-in PAPER research review; scheduled in UTC on market weekdays.
 * 22:15 UTC is after 16:00 ET in both daylight and standard time.
 * A market holiday produces NO_SESSION_EVIDENCE and zero API calls.
 */
import {getStore} from '@netlify/blobs';
import {runScheduledResearch} from './lib/research-openai37.mjs';
export const config={schedule:'15 22 * * 1-5'};
export default async function handler(){
  try{
    const result=await runScheduledResearch({store:getStore('dynamic-trading')});
    // No private API key or raw market observations in logs.
    console.log('DT37_OPENAI_RESEARCH',JSON.stringify(result));
    return new Response(result.status);
  }catch(error){
    console.error('DT37_OPENAI_RESEARCH_ERROR',String(error?.message||'unknown').slice(0,100));
    return new Response('RESEARCH_FAILED_CLOSED',{status:503});
  }
}
