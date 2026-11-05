/** One post-close, opt-in PAPER research review; scheduled in UTC on market weekdays.
 * 22:15 UTC is after 16:00 ET in both daylight and standard time.
 * A market holiday produces NO_SESSION_EVIDENCE and zero API calls.
 */
import {getStore} from '@netlify/blobs';
import {runScheduledResearch,newYorkDay} from './lib/research-openai37.mjs';
export const config={schedule:'15 22 * * 1-5'};
export default async function handler(){
  try{
    const store=getStore('dynamic-trading');
    const result=await runScheduledResearch({store});
    // Always publish a retrievable daily run receipt, even if paid review was
    // skipped. This receipt does not claim that OpenAI produced a report.
    const day=newYorkDay(new Date());
    try{await store.setJSON(`dt37-research-daily-delivery-${day}`,{
      day,status:result.status,at:new Date().toISOString(),
      paidReportCreated:result.status==='REVIEW_CREATED_NOT_APPLIED'||result.status==='ALREADY_REVIEWED',
      note:'A status receipt is not a paid review or proof of email delivery.'
    });}catch{console.warn('DT37_DAILY_RECEIPT_WRITE_FAILED',day);}
    // No private API key or raw market observations in logs.
    console.log('DT37_OPENAI_RESEARCH',JSON.stringify(result));
    return new Response(result.status);
  }catch(error){
    console.error('DT37_OPENAI_RESEARCH_ERROR',String(error?.message||'unknown').slice(0,100));
    return new Response('RESEARCH_FAILED_CLOSED',{status:503});
  }
}
