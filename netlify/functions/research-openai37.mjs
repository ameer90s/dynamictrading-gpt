/** One post-close, opt-in PAPER research review; scheduled in UTC on market weekdays.
 * 22:15 UTC is after 16:00 ET in both daylight and standard time.
 * A market holiday produces NO_SESSION_EVIDENCE and zero API calls.
 */
import {getStore} from '@netlify/blobs';
import {runScheduledResearch,newYorkDay} from './lib/research-openai37.mjs';
import {publishScalpResearch37} from './lib/scalp-agent-review37.mjs';
import {publishDailyDiagnostic37,dailyResearchKey37} from './lib/daily-research-diagnostic37.mjs';
export const config={schedule:'15 22 * * 1-5'};
export default async function handler(){
 const store=getStore('dynamic-trading'),now=new Date(),day=newYorkDay(now);
 let daily=null,prepared=null;
 // Never let the optional scalp research block the daily diagnostic.
 try{await publishScalpResearch37(store,day)}
 catch(e){console.error('DT37_SCALP_RESEARCH_ERROR',String(e?.message||'unknown').slice(0,90));}
 try{
  const result=await publishDailyDiagnostic37({store,day,now,env:process.env});
  daily=result.report;prepared=result.prepared;
 }catch(e){console.error('DT37_DAILY_DIAGNOSTIC_ERROR',String(e?.message||'unknown').slice(0,90));}
 let result;
 if(!daily)result={status:'DAILY_DIAGNOSTIC_NOT_VERIFIED_NO_API_SPEND',day};
 else try{result=await runScheduledResearch({store,now,prepared});}
 catch(e){result={status:'RESEARCH_FAILED_CLOSED',day,error:String(e?.message||'unknown').slice(0,90)};}
 const receipt={day,status:result.status,at:now.toISOString(),
  localReportSaved:Boolean(daily),localReportKey:daily?dailyResearchKey37(day):null,
  paidReportCreated:result.status==='REVIEW_CREATED_NOT_APPLIED'||result.status==='ALREADY_REVIEWED',
  note:'A saved local report is not an OpenAI review, email delivery, or proof of live performance.'};
 try{await store.setJSON(`dt37-research-daily-delivery-${day}`,receipt);}
 catch{console.error('DT37_DAILY_RECEIPT_WRITE_FAILED',day);}
 console.log('DT37_RESEARCH_DAILY_STATUS',JSON.stringify({day,status:result.status,localReportSaved:Boolean(daily)}));
 return new Response(result.status,{status:daily?200:503});
}
