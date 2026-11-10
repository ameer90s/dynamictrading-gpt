/** One post-close, opt-in PAPER research review; scheduled in UTC on market weekdays.
 * 22:15 UTC is after 16:00 ET in both daylight and standard time.
 * A market holiday produces NO_SESSION_EVIDENCE and zero API calls.
 */
import {getStore} from '@netlify/blobs';
import {runScheduledResearch,newYorkDay,pollOpenAiResearch37} from './lib/research-openai37.mjs';
import {publishDailyDiagnostic37,dailyResearchKey37} from './lib/daily-research-diagnostic37.mjs';
export const config={schedule:'15,17,20,23 22 * * 1-5'};
export default async function handler(){
 const store=getStore('dynamic-trading'),now=new Date(),day=newYorkDay(now);
 // Three short, read-only-provider polls after the first daily request; no new POST.
 if([17,20,23].includes(now.getUTCMinutes())){
  if(process.env.DT372_RESEARCH_BACKGROUND_ENABLED!=='true')return new Response('BACKGROUND_POLL_DISABLED');
  const polled=await pollOpenAiResearch37({store,env:process.env,day,now,finalPoll:now.getUTCMinutes()===23});
  const receipt={day,status:polled.status,phase:polled.phase||'PROVIDER_PENDING',reason:polled.reason||null,
   at:now.toISOString(),paidReportCreated:['REVIEW_CREATED_NOT_APPLIED','ALREADY_REVIEWED'].includes(polled.status),
   notification:polled.notification||{status:'NOT_AUTHORIZED',phoneDeliveryVerified:false}};
  await store.setJSON(`dt37-research-daily-delivery-${day}`,receipt);
  return new Response(polled.status);
 }
 let daily=null,prepared=null;
 try{
  const result=await publishDailyDiagnostic37({store,day,now,env:process.env});
  daily=result.report;prepared=result.prepared;
 }catch(e){console.error('DT37_DAILY_DIAGNOSTIC_ERROR',String(e?.message||'unknown').slice(0,90));}
 let result;
 if(!daily)result={status:'DAILY_DIAGNOSTIC_NOT_VERIFIED_NO_API_SPEND',day};
 else try{result=await runScheduledResearch({store,now,prepared});}
 catch(e){result={status:'RESEARCH_FAILED_CLOSED',day,error:String(e?.message||'unknown').slice(0,90)};}
 const receipt={day,status:result.status,phase:result.phase||null,reason:result.reason||result.error||null,
  providerResponseId:result.responseId||null,at:now.toISOString(),
  localReportSaved:Boolean(daily),localReportKey:daily?dailyResearchKey37(day):null,
  paidReportCreated:result.status==='REVIEW_CREATED_NOT_APPLIED'||result.status==='ALREADY_REVIEWED',
  note:'A saved local report is not an OpenAI review, email delivery, or proof of live performance.'};
 try{await store.setJSON(`dt37-research-daily-delivery-${day}`,receipt);}
 catch{console.error('DT37_DAILY_RECEIPT_WRITE_FAILED',day);}
 console.log('DT37_RESEARCH_DAILY_STATUS',JSON.stringify({day,status:result.status,localReportSaved:Boolean(daily)}));
 return new Response(result.status,{status:daily?200:503});
}
