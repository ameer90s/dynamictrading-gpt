/** One post-close, opt-in PAPER research review; scheduled in UTC on market weekdays.
 * 22:15 UTC is after 16:00 ET in both daylight and standard time.
 * A market holiday produces NO_SESSION_EVIDENCE and zero API calls.
 */
import {getStore} from '@netlify/blobs';
import {runScheduledResearch,newYorkDay,pollOpenAiResearch37} from './lib/research-openai37.mjs';
import {recoverPendingResearch38} from './lib/research-recovery38.mjs';
import {publishDailyDiagnostic37,dailyResearchKey37} from './lib/daily-research-diagnostic37.mjs';
export const config={schedule:'15,30 22 * * 1-5'};
export default async function handler(){return runResearchSchedule38();}
export async function runResearchSchedule38({store=getStore('dynamic-trading'),now=new Date(),env=process.env,pollFn=pollOpenAiResearch37,runFn=runScheduledResearch,publishFn=publishDailyDiagnostic37}={}){
 const day=newYorkDay(now);
 // Four total scheduled invocations: 22:15 POST, 22:30, 23:00 and 23:45 UTC GET-only polls.
 if(now.getUTCHours()===23||now.getUTCMinutes()===30){
  if(env.DT372_RESEARCH_BACKGROUND_ENABLED!=='true'||env.DT372_RESEARCH_BACKGROUND_VERIFIED!=='true')return new Response('BACKGROUND_NOT_CONFIGURED_NO_API_SPEND');
  const polled=await pollFn({store,env,day,now,finalPoll:now.getUTCHours()===23&&now.getUTCMinutes()===45});
  const receipt={day,status:polled.status,phase:polled.phase||'PROVIDER_PENDING',reason:polled.reason||null,
   at:now.toISOString(),paidReportCreated:['REVIEW_CREATED_NOT_APPLIED','ALREADY_REVIEWED'].includes(polled.status),
   providerResponseId:polled.responseId||null,notification:polled.notification||{status:'NOT_AUTHORIZED',phoneDeliveryVerified:false}};
  await store.setJSON(`dt37-research-daily-delivery-${day}`,receipt);
  console.log('DT37_RESEARCH_BACKGROUND_POLL',JSON.stringify({day,status:polled.status,phase:receipt.phase,reason:receipt.reason,responseIdSaved:Boolean(receipt.providerResponseId)}));
  return new Response(polled.status);
 }
 // One recovery GET for a prior session, never a second provider POST. Does not block today's daily report.
 try{const recovered=await recoverPendingResearch38({store,env,now,currentDay:day,pollFn});
  console.log('DT38_RESEARCH_PREVIOUS_RECOVERY',JSON.stringify({status:recovered.status,day:recovered.recoveredDay||null}));}
 catch(e){console.error('DT38_RESEARCH_PREVIOUS_RECOVERY_FAILED',String(e?.message||e).slice(0,90));}
 let daily=null,prepared=null;
 try{
  const result=await publishFn({store,day,now,env});
  daily=result.report;prepared=result.prepared;
 }catch(e){console.error('DT37_DAILY_DIAGNOSTIC_ERROR',String(e?.message||'unknown').slice(0,90));}
 let result;
 if(!daily)result={status:'DAILY_DIAGNOSTIC_NOT_VERIFIED_NO_API_SPEND',day};
 else try{result=await runFn({store,env,now,prepared});}
 catch(e){result={status:'RESEARCH_FAILED_CLOSED',day,error:String(e?.message||'unknown').slice(0,90)};}
 const receipt={day,status:result.status,phase:result.phase||null,reason:result.reason||result.error||null,
  providerResponseId:result.responseId||null,at:now.toISOString(),
  localReportSaved:Boolean(daily),localReportKey:daily?dailyResearchKey37(day):null,
  paidReportCreated:result.status==='REVIEW_CREATED_NOT_APPLIED'||result.status==='ALREADY_REVIEWED',
  note:'A saved local report is not an OpenAI review, email delivery, or proof of live performance.'};
 try{await store.setJSON(`dt37-research-daily-delivery-${day}`,receipt);}
 catch{console.error('DT37_DAILY_RECEIPT_WRITE_FAILED',day);}
 console.log('DT37_RESEARCH_DAILY_STATUS',JSON.stringify({day,status:result.status,phase:receipt.phase,reason:receipt.reason,localReportSaved:Boolean(daily),backgroundEnabled:env.DT372_RESEARCH_BACKGROUND_ENABLED==='true',backgroundVerified:env.DT372_RESEARCH_BACKGROUND_VERIFIED==='true',responseIdSaved:Boolean(result.responseId)}));
 return new Response(result.status,{status:daily?200:503});
}
