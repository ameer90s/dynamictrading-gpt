/** Read-only status for the independent Research Agent dashboard. No keys or private raw logs sent. */
import {getStore} from '@netlify/blobs';
import {newYorkDay,researchBudgetKey37,PILOT} from './lib/research-openai37.mjs';
import {dailyResearchKey37} from './lib/daily-research-diagnostic37.mjs';
import {publicResearchSummary} from './lib/research-public37.mjs';
import {strategyLearningKey37} from './lib/research-learning-runtime37.mjs';
import {recentResearchReportEnds37,researchWeeklyKey37,researchMonthlyKey37,researchMemoryKey37} from './lib/research-memory-cadence37.mjs';
const json=(x,code=200)=>new Response(JSON.stringify(x),{status:code,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export default async function handler(request){
  const url=new URL(request.url);
  const supplied=url.searchParams.get('day');
  const day=supplied===null?newYorkDay():supplied;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return json({error:'BAD_DATE'},400);
  try{
    const store=getStore('dynamic-trading');
    const keys=[`dt37-openai37-review-${day}`,`dt37-research-agent-daily-${day}`,`dt37-research-evidence-quality-${day}`,strategyLearningKey37(day),`dt37-research-daily-delivery-${day}`,dailyResearchKey37(day)];
    // Read each independent record separately: a failed primary review key must
    // not hide a valid paid report in the recovery key.
    const settled=await Promise.all(keys.map(k=>store.get(k,{type:'json',consistency:'strong'})
      .then(value=>({ok:true,value}),()=>({ok:false,value:null}))));
    const [primary,localRead,evidenceRead,learningRead,deliveryRead,dailyRead]=settled;
    const primaryReview=primary.value;
    const local=localRead.value,evidence=evidenceRead.value,
      learning=learningRead.value,delivery=deliveryRead.value,daily=dailyRead.value;
    const secondary=primaryReview?.status==='REVIEW_CREATED_NOT_APPLIED'?{ok:true,value:null}:
      await store.get(`dt37-openai37-review-recovery-${day}`,{type:'json',consistency:'strong'})
        .then(value=>({ok:true,value}),()=>({ok:false,value:null}));
    const recovered=secondary.value;
    const review=primaryReview?.status==='REVIEW_CREATED_NOT_APPLIED'?primaryReview:
      recovered?.status==='REVIEW_CREATED_NOT_APPLIED'?recovered:primaryReview;
    if(!review&&!daily&&!local&&(!primary.ok||!secondary.ok))
      return json({day,status:'ARCHIVE_UNAVAILABLE',error:'PAID_REPORT_READ_UNVERIFIED',mode:'PAPER_ONLY'},503);
    // Weekly/monthly records change only at period boundaries. Clients request
    // them at initial load or on manual refresh, not every 60-second poll.
    const includePeriods=url.searchParams.get('includePeriods')==='1';
    let weekly=null,monthly=null,memory=null;const periodWarnings=[];
    if(includePeriods){
      const ends=recentResearchReportEnds37(day);
      const periodKeys=[researchWeeklyKey37(ends.weekly),researchMonthlyKey37(ends.monthly),researchMemoryKey37];
      const periodResults=await Promise.all(periodKeys.map(k=>store.get(k,{type:'json',consistency:'strong'})
        .then(value=>({ok:true,value}),()=>({ok:false,value:null}))));
      [weekly,monthly,memory]=periodResults.map(x=>x.value);
      periodResults.forEach((x,i)=>{if(!x.ok)periodWarnings.push(['WEEKLY','MONTHLY','MEMORY'][i]+'_ARCHIVE_READ_FAILED')});
    }
    let budget=null;
    // The research budget is not a trading account balance; only expose aggregated usage counts.
    try{budget=await store.get(researchBudgetKey37(day),{type:'json',consistency:'strong'});}catch{ /* Optional budget status only */ }
    const scalpReport=await store.get(`dt37-scalp-agent-review-${day}`,{type:'json',consistency:'strong'}).catch(()=>null);
    return json({...publicResearchSummary({day,review,local,evidence,budget,learning,weekly,monthly,memory,daily,budgetLimitUsd:PILOT.budgetUsd}),
      periodWarnings,
      scalpResearch:scalpReport||{status:'NOT_RECORDED',day},
      delivery:delivery||{status:'NO_DAILY_RUN_RECEIPT',day}});
  }catch(e){return json({day,status:'ARCHIVE_UNAVAILABLE',error:'READ_FAILED',mode:'PAPER_ONLY'},503)}
}
